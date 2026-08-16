begin;

-- Preserve the driver's safe campaign read model. Geography values are exposed
-- as GeoJSON while operational budget fields remain hidden from DRIVER clients.
alter table public.campaigns
  add column if not exists display_area_name varchar(120);

create or replace view public.campaigns_driver_v with (security_invoker = true) as
  select id,
         status,
         bonus_amount,
         fare_multiplier,
         start_at,
         end_at,
         reward_cutoff_at,
         display_area_name,
         st_asgeojson(geofence)::jsonb          as geofence_geojson,
         st_asgeojson(navigation_target)::jsonb as navigation_target_geojson
  from public.campaigns;

grant select on public.campaigns_driver_v to authenticated;

-- Accept/decline must remain a service-role transaction through
-- respond_to_offer. The browser may only mark an offer as viewed.
revoke update on public.driver_offers from anon, authenticated;
grant update (viewed_at) on public.driver_offers to authenticated;

-- Adapt the existing DB-first transaction to the original driver-service rules:
-- one active campaign per driver, a state row for first-time drivers, and the
-- 15/60-minute slot/arrival deadlines used by the teammate implementation.
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_driver_id uuid,
  p_response text,
  p_actor_type text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_result uuid;
begin
  select campaign_id into v_campaign_id
  from public.driver_offers
  where id = p_offer_id and driver_id = p_driver_id;

  if p_response = 'ACCEPTED' then
    if exists (
      select 1 from public.driver_states
      where driver_id = p_driver_id and active_campaign_id is not null
    ) then
      raise exception using errcode = '23505', message = 'Driver is already in a campaign';
    end if;

    -- TARGET_REACHED is a terminal campaign state with a distinct API contract.
    -- Check it before the generic ACTIVE guard, otherwise a full campaign is
    -- incorrectly reported to the driver as merely inactive.
    if exists (
      select 1 from public.campaigns
      where id = v_campaign_id and status = 'TARGET_REACHED'
    ) then
      raise exception using errcode = '23514', message = 'Campaign target is already full';
    end if;

    if not exists (
      select 1 from public.campaigns
      where id = v_campaign_id
        and status = 'ACTIVE'
        and target_driver_count is not null
        and navigation_target is not null
    ) then
      raise exception using errcode = '23514', message = 'Campaign is not active';
    end if;

    insert into public.driver_states (driver_id, updated_at)
    values (p_driver_id, now())
    on conflict (driver_id) do nothing;
  end if;

  v_result := public.respond_to_offer(p_offer_id, p_driver_id, p_response, p_actor_type);

  if p_response = 'ACCEPTED' then
    update public.campaign_participations
    set slot_deadline_at = accepted_at + interval '15 minutes',
        arrival_deadline_at = accepted_at + interval '60 minutes'
    where offer_id = p_offer_id and driver_id = p_driver_id;
  end if;

  update public.audit_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where actor_id = p_driver_id
    and (
      (entity_type = 'offer' and entity_id = p_offer_id::text and action in ('OfferAccepted', 'OfferDeclined'))
      or (entity_type = 'campaign' and entity_id = v_campaign_id::text and action = 'CampaignTargetReached')
    );

  return v_result;
end;
$$;

revoke all on function public.respond_to_offer(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.respond_to_offer(uuid, uuid, text, text, text) to service_role;

-- Demo-only reset ported from the teammate backend. The API exposes this RPC
-- only when DEMO_MODE=true; it is not an offer producer or ranking mechanism.
create or replace function public.reset_driver_demo_offer(
  p_driver_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_offer_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text, 0));

  select c.id into v_campaign_id
  from public.campaigns c
  where c.status = 'ACTIVE'
    and not exists (
      select 1
      from public.campaign_participations p
      left join public.reward_records r on r.participation_id = p.id
      where p.campaign_id = c.id
        and p.driver_id = p_driver_id
        and (p.status in ('NO_SHOW', 'LOCATION_LOST') or r.id is not null)
    )
  order by c.start_at desc
  limit 1;

  if v_campaign_id is null then
    raise exception using errcode = '23514', message = 'No resettable active campaign';
  end if;

  select id into v_offer_id
  from public.driver_offers
  where driver_id = p_driver_id and campaign_id = v_campaign_id
  order by sent_at desc nulls last
  limit 1
  for update;

  if v_offer_id is null then
    insert into public.driver_offers (
      campaign_id, driver_id, batch_no, status, sent_at, expires_at
    ) values (
      v_campaign_id, p_driver_id, 1, 'SENT', now(), now() + interval '30 minutes'
    ) returning id into v_offer_id;
  else
    update public.driver_offers
    set status = 'SENT',
        sent_at = now(),
        expires_at = now() + interval '30 minutes',
        viewed_at = null,
        responded_at = null
    where id = v_offer_id;
  end if;

  with deleted as (
    delete from public.campaign_participations
    where driver_id = p_driver_id
      and campaign_id = v_campaign_id
      and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED')
      and not exists (
        select 1 from public.reward_records
        where participation_id = campaign_participations.id
      )
    returning campaign_id
  )
  update public.driver_states state
  set active_campaign_id = null, updated_at = now()
  where state.driver_id = p_driver_id
    and (
      state.active_campaign_id in (select campaign_id from deleted)
      or not exists (
        select 1 from public.campaign_participations p
        where p.driver_id = state.driver_id
          and p.campaign_id = state.active_campaign_id
          and p.status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED')
      )
    );

  insert into public.audit_logs (
    actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
  ) values (
    p_driver_id, 'DRIVER', 'driver_offers', v_offer_id::text, 'DEBUG_RESET_OFFER', null,
    jsonb_build_object('status', 'SENT', 'campaign_id', v_campaign_id),
    jsonb_build_object('request_id', p_request_id)
  );

  return jsonb_build_object(
    'offer_id', v_offer_id,
    'campaign_id', v_campaign_id,
    'status', 'SENT'
  );
end;
$$;

revoke all on function public.reset_driver_demo_offer(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_driver_demo_offer(uuid, text) to service_role;

-- Realtime invalidates only the two low-frequency resources consumed by the
-- driver UI. GPS/state tables intentionally stay out of the publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_offers'
    ) then
      alter publication supabase_realtime add table public.driver_offers;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'campaign_participations'
    ) then
      alter publication supabase_realtime add table public.campaign_participations;
    end if;
  end if;
end
$$;

commit;
