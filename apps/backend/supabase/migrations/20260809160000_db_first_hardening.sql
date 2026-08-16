-- DB-first hardening for the GSM backend.
-- This migration normalizes legacy seed values, freezes lifecycle constraints,
-- secures public signup, and exposes atomic service-role operations.

begin;

-- Public signup must never be able to self-assign OPERATOR through user metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, is_active)
  values (
    new.id,
    'DRIVER',
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Driver'), '@', 1)),
    true
  )
  on conflict (id) do nothing;

  insert into public.driver_states (driver_id, is_online, operational_status)
  values (new.id, false, 'OFFLINE')
  on conflict (driver_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- Normalize values that predate the canonical lifecycle vocabulary.
update public.hotspots set status = 'DETECTED' where status = 'PROPOSED';
update public.proposals set policy_status = 'PASSED' where policy_status = 'WITHIN_POLICY';
update public.proposals set status = 'UNDER_REVIEW' where status = 'REVISED';
update public.campaigns set status = 'ACTIVE' where status = 'RUNNING';
update public.reward_records set reward_type = 'RELOCATION' where reward_type = 'RELOCATION_BONUS';
update public.reward_records set reward_type = 'ZONE_TRIP' where reward_type = 'TRIP_BONUS';
update public.reward_records set status = 'SIMULATED_PAID' where status = 'PAID';

alter table public.hotspots drop constraint if exists hotspots_status_check;
alter table public.hotspots add constraint hotspots_status_check
  check (status in ('DETECTED', 'MONITORING', 'STABILIZED', 'CLOSED'));

alter table public.hotspots drop constraint if exists hotspots_severity_level_check;
alter table public.hotspots add constraint hotspots_severity_level_check
  check (severity_level in ('GREEN', 'YELLOW', 'ORANGE', 'RED'));

alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals add constraint proposals_status_check
  check (status in ('GENERATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'STALE', 'FAILED_GENERATION'));

alter table public.proposals drop constraint if exists proposals_policy_status_check;
alter table public.proposals add constraint proposals_policy_status_check
  check (policy_status in ('PENDING', 'PASSED', 'FAILED'));

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('DRAFT', 'ACTIVE', 'TARGET_REACHED', 'COMPLETED', 'CANCELLED', 'BUDGET_EXHAUSTED'));

alter table public.driver_offers drop constraint if exists driver_offers_status_check;
alter table public.driver_offers add constraint driver_offers_status_check
  check (status in ('CREATED', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED'));

alter table public.campaign_participations drop constraint if exists campaign_participations_status_check;
alter table public.campaign_participations add constraint campaign_participations_status_check
  check (status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED', 'CANCELLED', 'LOCATION_LOST', 'NO_SHOW'));

alter table public.driver_states drop constraint if exists driver_states_operational_status_check;
alter table public.driver_states add constraint driver_states_operational_status_check
  check (operational_status in ('OFFLINE', 'IDLE', 'EN_ROUTE', 'ACTIVATED', 'ON_TRIP'));

alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('CREATED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'));

alter table public.reward_records drop constraint if exists reward_records_reward_type_check;
alter table public.reward_records add constraint reward_records_reward_type_check
  check (reward_type in ('RELOCATION', 'ZONE_TRIP'));

alter table public.reward_records drop constraint if exists reward_records_status_check;
alter table public.reward_records add constraint reward_records_status_check
  check (status in ('PENDING', 'QUALIFIED', 'NOT_QUALIFIED', 'SIMULATED_PAID'));

create unique index if not exists campaigns_proposal_id_uidx
  on public.campaigns (proposal_id);
create unique index if not exists campaign_participations_offer_id_uidx
  on public.campaign_participations (offer_id)
  where offer_id is not null;

-- PostGIS values are exposed as GeoJSON at the API boundary, never as WKB hex.
create or replace view public.h3_cells_api_v
with (security_invoker = true)
as
select
  h.*,
  st_asgeojson(h.center_point::geometry)::jsonb as center_geojson,
  st_asgeojson(h.boundary::geometry)::jsonb as boundary_geojson
from public.h3_cells h;

create or replace view public.driver_states_api_v
with (security_invoker = true)
as
select
  d.*,
  case when d.current_location is null then null
       else st_asgeojson(d.current_location::geometry)::jsonb end as current_location_geojson
from public.driver_states d;

revoke all on public.h3_cells_api_v from anon;
revoke all on public.driver_states_api_v from anon;
grant select on public.h3_cells_api_v to authenticated, service_role;
grant select on public.driver_states_api_v to authenticated, service_role;

create or replace function public.revise_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_source_plan jsonb,
  p_target_driver_count integer,
  p_bonus_amount numeric,
  p_fare_multiplier numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.proposals%rowtype;
  v_new_id uuid;
begin
  select * into v_current from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if v_current.status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '23514', message = 'Proposal cannot be revised in its current state';
  end if;
  if p_target_driver_count < 1 or p_bonus_amount < 0 or p_fare_multiplier < 1 or p_fare_multiplier > 5 then
    raise exception using errcode = '22023', message = 'Invalid revision values';
  end if;

  insert into public.proposals (
    hotspot_id, input_snapshot_id, root_proposal_id, parent_proposal_id, version,
    generator_type, generator_version, status, policy_status, target_h3_indexes,
    target_geofence, source_plan, target_driver_count, offer_count,
    window_start_at, window_end_at, bonus_amount, fare_multiplier, estimated_cost,
    simulation_details, explanation, review_note
  ) values (
    v_current.hotspot_id, v_current.input_snapshot_id,
    coalesce(v_current.root_proposal_id, v_current.id), v_current.id, coalesce(v_current.version, 1) + 1,
    v_current.generator_type, v_current.generator_version, 'UNDER_REVIEW', v_current.policy_status,
    v_current.target_h3_indexes, v_current.target_geofence, p_source_plan,
    p_target_driver_count, greatest(coalesce(v_current.offer_count, p_target_driver_count), p_target_driver_count),
    v_current.window_start_at, v_current.window_end_at, p_bonus_amount, p_fare_multiplier,
    p_target_driver_count * p_bonus_amount, v_current.simulation_details,
    v_current.explanation, p_note
  ) returning id into v_new_id;

  update public.proposals set status = 'STALE' where id = v_current.id;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data)
  values (
    p_actor_id, 'OPERATOR', 'proposal', v_new_id::text, 'Revised',
    jsonb_build_object('proposal_id', v_current.id, 'version', v_current.version),
    jsonb_build_object('proposal_id', v_new_id, 'version', coalesce(v_current.version, 1) + 1)
  );
  return v_new_id;
end;
$$;

create or replace function public.review_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text default null,
  p_reason_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.proposals%rowtype;
begin
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception using errcode = '22023', message = 'Invalid review decision';
  end if;

  select * into v_before from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if v_before.status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '23514', message = 'Proposal was already reviewed';
  end if;
  if p_decision = 'APPROVED' and v_before.policy_status <> 'PASSED' then
    raise exception using errcode = '23514', message = 'Only policy-passed proposals can be approved';
  end if;

  update public.proposals
  set status = p_decision,
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      review_note = concat_ws(': ', nullif(p_reason_code, ''), nullif(p_note, ''))
  where id = p_proposal_id;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata)
  values (
    p_actor_id, 'OPERATOR', 'proposal', p_proposal_id::text,
    case when p_decision = 'APPROVED' then 'Approved' else 'Rejected' end,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', p_decision),
    jsonb_build_object('reason_code', p_reason_code, 'note', p_note)
  );
  return p_proposal_id;
end;
$$;

create or replace function public.activate_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_response_mode text default 'mixed',
  p_driver_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_proposal public.proposals%rowtype;
  v_campaign_id uuid;
  v_driver_id uuid;
  v_selected_count integer := 0;
  v_area_name text;
begin
  if p_response_mode not in ('human', 'simulated', 'mixed') then
    raise exception using errcode = '22023', message = 'Invalid response mode';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if v_proposal.status <> 'APPROVED' then
    raise exception using errcode = '23514', message = 'Only APPROVED proposals can be activated';
  end if;
  if exists (select 1 from public.campaigns where proposal_id = p_proposal_id) then
    raise exception using errcode = '23505', message = 'Proposal already has a campaign';
  end if;

  select string_agg(distinct district_name, ', ' order by district_name)
  into v_area_name
  from public.h3_cells
  where h3_index = any(v_proposal.target_h3_indexes);

  insert into public.campaigns (
    proposal_id, status, target_h3_indexes, geofence, navigation_target,
    target_driver_count, batch_size, start_at, end_at, reward_cutoff_at,
    bonus_amount, fare_multiplier, budget_limit, budget_used, created_by, display_area_name
  ) values (
    v_proposal.id, 'ACTIVE', v_proposal.target_h3_indexes, v_proposal.target_geofence,
    st_centroid(v_proposal.target_geofence::geometry)::geography,
    v_proposal.target_driver_count, v_proposal.offer_count, now(),
    coalesce(v_proposal.window_end_at, now() + interval '60 minutes'),
    coalesce(v_proposal.window_end_at, now() + interval '60 minutes'),
    v_proposal.bonus_amount, v_proposal.fare_multiplier,
    greatest(coalesce(v_proposal.estimated_cost, 0), 0), 0, p_actor_id, v_area_name
  ) returning id into v_campaign_id;

  for v_driver_id in
    select candidates.driver_id
    from (
      select unnest(p_driver_ids) as driver_id
      where coalesce(array_length(p_driver_ids, 1), 0) > 0
      union all
      select ds.driver_id
      from public.driver_states ds
      join public.profiles p on p.id = ds.driver_id
      where coalesce(array_length(p_driver_ids, 1), 0) = 0
        and ds.is_online = true and ds.operational_status = 'IDLE'
        and p.role = 'DRIVER' and p.is_active = true
      order by driver_id
      limit coalesce(v_proposal.offer_count, v_proposal.target_driver_count, 0)
    ) candidates
  loop
    insert into public.driver_offers (campaign_id, driver_id, batch_no, status, sent_at, expires_at)
    values (
      v_campaign_id, v_driver_id, 1, 'SENT', now(),
      least(coalesce(v_proposal.window_end_at, now() + interval '10 minutes'), now() + interval '10 minutes')
    );
    v_selected_count := v_selected_count + 1;
  end loop;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, after_data, metadata)
  values (
    p_actor_id, 'OPERATOR', 'campaign', v_campaign_id::text, 'ActivationStarted',
    jsonb_build_object('campaign_id', v_campaign_id, 'proposal_id', p_proposal_id, 'status', 'ACTIVE'),
    jsonb_build_object('response_mode', p_response_mode, 'offers_sent', v_selected_count, 'proposal_id', p_proposal_id)
  );
  return v_campaign_id;
end;
$$;

create or replace function public.cancel_campaign(p_campaign_id uuid, p_actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found';
  end if;
  if v_campaign.status not in ('DRAFT', 'ACTIVE', 'TARGET_REACHED') then
    raise exception using errcode = '23514', message = 'Campaign cannot be cancelled';
  end if;

  update public.campaigns set status = 'CANCELLED', completed_at = now() where id = p_campaign_id;
  update public.driver_offers
    set status = 'EXPIRED', responded_at = coalesce(responded_at, now())
    where campaign_id = p_campaign_id and status in ('CREATED', 'SENT', 'VIEWED');
  update public.campaign_participations
    set status = 'CANCELLED'
    where campaign_id = p_campaign_id and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED');
  update public.driver_states
    set active_campaign_id = null,
        operational_status = case when is_online then 'IDLE' else 'OFFLINE' end
    where active_campaign_id = p_campaign_id;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data)
  values (
    p_actor_id, 'OPERATOR', 'campaign', p_campaign_id::text, 'CampaignCancelled',
    jsonb_build_object('status', v_campaign.status), jsonb_build_object('status', 'CANCELLED')
  );
  return p_campaign_id;
end;
$$;

create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_driver_id uuid,
  p_response text,
  p_actor_type text default 'DRIVER'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.driver_offers%rowtype;
  v_campaign public.campaigns%rowtype;
  v_active_count integer;
begin
  if p_response not in ('ACCEPTED', 'DECLINED') then
    raise exception using errcode = '22023', message = 'Invalid offer response';
  end if;
  if p_actor_type not in ('DRIVER', 'OPERATOR') then
    raise exception using errcode = '22023', message = 'Invalid actor type';
  end if;

  select * into v_offer from public.driver_offers where id = p_offer_id for update;
  if not found or v_offer.driver_id <> p_driver_id then
    raise exception using errcode = 'P0002', message = 'Offer not found';
  end if;
  if v_offer.status not in ('SENT', 'VIEWED') or v_offer.expires_at <= now() then
    raise exception using errcode = '23514', message = 'Offer is expired or closed';
  end if;

  select * into v_campaign from public.campaigns where id = v_offer.campaign_id for update;
  if v_campaign.status <> 'ACTIVE' then
    raise exception using errcode = '23514', message = 'Campaign is not active';
  end if;

  if p_response = 'ACCEPTED' then
    select count(*) into v_active_count
    from public.campaign_participations
    where campaign_id = v_campaign.id
      and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED');
    if v_active_count >= v_campaign.target_driver_count then
      raise exception using errcode = '23514', message = 'Campaign target is already full';
    end if;

    update public.driver_offers set status = 'ACCEPTED', responded_at = now() where id = p_offer_id;
    insert into public.campaign_participations (
      campaign_id, driver_id, offer_id, status, accepted_at, slot_deadline_at, arrival_deadline_at
    ) values (
      v_campaign.id, p_driver_id, p_offer_id, 'ACCEPTED', now(),
      least(v_campaign.end_at, now() + interval '10 minutes'),
      least(v_campaign.end_at, now() + interval '30 minutes')
    );
    update public.driver_states
      set active_campaign_id = v_campaign.id, operational_status = 'EN_ROUTE', is_online = true
      where driver_id = p_driver_id;
  else
    update public.driver_offers set status = 'DECLINED', responded_at = now() where id = p_offer_id;
  end if;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata)
  values (
    p_driver_id, p_actor_type, 'offer', p_offer_id::text,
    case when p_response = 'ACCEPTED' then 'OfferAccepted' else 'OfferDeclined' end,
    jsonb_build_object('status', v_offer.status), jsonb_build_object('status', p_response),
    jsonb_build_object('campaign_id', v_campaign.id, 'proposal_id', v_campaign.proposal_id)
  );
  return p_offer_id;
end;
$$;

create or replace function public.expire_offer(p_offer_id uuid, p_actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.driver_offers%rowtype;
begin
  select * into v_offer from public.driver_offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Offer not found';
  end if;
  if v_offer.status not in ('CREATED', 'SENT', 'VIEWED') then
    raise exception using errcode = '23514', message = 'Offer cannot be expired';
  end if;

  update public.driver_offers set status = 'EXPIRED', responded_at = coalesce(responded_at, now()) where id = p_offer_id;
  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data)
  values (
    p_actor_id, 'OPERATOR', 'offer', p_offer_id::text, 'OfferExpired',
    jsonb_build_object('status', v_offer.status), jsonb_build_object('status', 'EXPIRED')
  );
  return p_offer_id;
end;
$$;

revoke all on function public.revise_proposal(uuid, uuid, jsonb, integer, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.review_proposal(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.activate_proposal(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.activate_proposal(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.cancel_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_to_offer(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_offer(uuid, uuid) from public, anon, authenticated;

grant execute on function public.revise_proposal(uuid, uuid, jsonb, integer, numeric, numeric, text) to service_role;
grant execute on function public.review_proposal(uuid, uuid, text, text, text) to service_role;
grant execute on function public.activate_proposal(uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.cancel_campaign(uuid, uuid) to service_role;
grant execute on function public.respond_to_offer(uuid, uuid, text, text) to service_role;
grant execute on function public.expire_offer(uuid, uuid) to service_role;

drop function if exists public.activate_proposal(uuid, text, uuid[]);

commit;
