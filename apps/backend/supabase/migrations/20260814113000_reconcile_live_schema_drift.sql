-- Forward-only repair for the live schema inspected on 2026-08-14.
--
-- Operator gate before applying:
--   1. verify `.runtime/backups/critical_20260814_1100.json`;
--   2. confirm the inventory in OPERATOR_IMPLEMENTATION_MASTER_CHECKLIST.md;
--   3. run this migration once, then run every post-check and authenticated smoke.
--
-- This intentionally applies only the net state of the missing/conflicting
-- migrations. It does not replay migrations whose objects already exist live.
begin;

do $preflight$
begin
  if to_regclass('public.campaigns') is null
     or to_regclass('public.proposals') is null
     or to_regclass('public.ai_zone_forecasts') is null
     or to_regclass('public.model_outputs') is null then
    raise exception 'Repair preflight failed: required tables are missing';
  end if;
  if to_regprocedure('public.revise_proposal(uuid,uuid,jsonb,integer,integer,numeric,numeric,numeric,numeric,text)') is null then
    raise exception 'Repair preflight failed: extended revise_proposal wrapper is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'display_area_name'
  ) then
    raise exception 'Repair preflight failed: campaigns.display_area_name is missing';
  end if;
end
$preflight$;

-- Net state of 20260812203000_campaign_area_name_capacity.sql.
-- PostgreSQL will not alter a column type while a view depends on it. Rebuild
-- the existing driver-safe projection in the same transaction so its grant and
-- security-invoker boundary are preserved.
drop view if exists public.campaigns_driver_v;
alter table public.campaigns
  alter column display_area_name type text;
create view public.campaigns_driver_v with (security_invoker = true) as
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

-- Net state of 20260812213000_campaign_target_execution_semantics.sql.
create or replace function public.release_driver_states_for_terminal_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('COMPLETED', 'CANCELLED', 'BUDGET_EXHAUSTED')
     and new.status is distinct from old.status then
    update public.driver_states
    set active_campaign_id = null,
        operational_status = case when is_online then 'IDLE' else 'OFFLINE' end,
        updated_at = now()
    where active_campaign_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.reconcile_campaign_lifecycle(p_request_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_next_status text;
  v_campaign_count integer := 0;
  v_offer_count integer := 0;
  v_expired integer;
  v_request_id text := coalesce(nullif(p_request_id, ''), 'lifecycle-' || gen_random_uuid()::text);
begin
  for v_campaign in
    select * from public.campaigns
    where status in ('ACTIVE', 'TARGET_REACHED')
      and ((budget_limit > 0 and budget_used >= budget_limit) or end_at <= now())
    order by id for update skip locked
  loop
    v_next_status := case
      when v_campaign.budget_limit > 0 and v_campaign.budget_used >= v_campaign.budget_limit then 'BUDGET_EXHAUSTED'
      else 'COMPLETED'
    end;

    update public.campaigns set status = v_next_status, completed_at = coalesce(completed_at, now())
    where id = v_campaign.id and status in ('ACTIVE', 'TARGET_REACHED');
    if not found then continue; end if;

    with candidates as materialized (
      select id, status from public.driver_offers
      where campaign_id = v_campaign.id and status in ('CREATED', 'SENT', 'VIEWED')
      for update skip locked
    ), expired as (
      update public.driver_offers offers
      set status = 'EXPIRED', responded_at = coalesce(offers.responded_at, now())
      from candidates where offers.id = candidates.id
      returning offers.id, candidates.status as before_status
    ), audited as (
      insert into public.audit_logs (
        actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
      )
      select null, 'SYSTEM', 'offer', expired.id::text, 'OfferExpired',
        jsonb_build_object('status', expired.before_status), jsonb_build_object('status', 'EXPIRED'),
        jsonb_build_object('request_id', v_request_id, 'campaign_id', v_campaign.id, 'reason', 'campaign_terminal')
      from expired returning 1
    )
    select count(*) into v_expired from audited;
    v_offer_count := v_offer_count + v_expired;

    insert into public.audit_logs (
      actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
    ) values (
      null, 'SYSTEM', 'campaign', v_campaign.id::text,
      case when v_next_status = 'BUDGET_EXHAUSTED' then 'CampaignBudgetExhausted' else 'CampaignCompleted' end,
      jsonb_build_object('status', v_campaign.status, 'budget_used', v_campaign.budget_used),
      jsonb_build_object('status', v_next_status, 'budget_used', v_campaign.budget_used),
      jsonb_build_object('request_id', v_request_id, 'proposal_id', v_campaign.proposal_id,
        'expired_offer_count', v_expired,
        'reason', case when v_next_status = 'BUDGET_EXHAUSTED' then 'budget_limit_reached' else 'end_at_reached' end)
    );
    v_campaign_count := v_campaign_count + 1;
  end loop;

  with candidates as materialized (
    select offers.id, offers.campaign_id, offers.status
    from public.driver_offers offers
    join public.campaigns campaigns on campaigns.id = offers.campaign_id
    where campaigns.status in ('ACTIVE', 'TARGET_REACHED')
      and offers.status in ('CREATED', 'SENT', 'VIEWED')
      and offers.expires_at <= now()
    for update of offers skip locked
  ), expired as (
    update public.driver_offers offers
    set status = 'EXPIRED', responded_at = coalesce(offers.responded_at, now())
    from candidates where offers.id = candidates.id
    returning offers.id, offers.campaign_id, candidates.status as before_status
  ), audited as (
    insert into public.audit_logs (
      actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
    )
    select null, 'SYSTEM', 'offer', expired.id::text, 'OfferExpired',
      jsonb_build_object('status', expired.before_status), jsonb_build_object('status', 'EXPIRED'),
      jsonb_build_object('request_id', v_request_id, 'campaign_id', expired.campaign_id, 'reason', 'expires_at_reached')
    from expired returning 1
  )
  select count(*) into v_expired from audited;
  v_offer_count := v_offer_count + v_expired;

  return jsonb_build_object('campaigns_transitioned', v_campaign_count, 'offers_expired', v_offer_count,
    'request_id', v_request_id, 'ran_at', now());
end;
$$;

revoke all on function public.reconcile_campaign_lifecycle(text) from public, anon, authenticated;
grant execute on function public.reconcile_campaign_lifecycle(text) to service_role;

-- Net state of 20260812215000_relocation_only_review.sql.
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
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  if v_current.status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '23514', message = 'Proposal cannot be revised in its current state';
  end if;
  if v_current.window_end_at is null or v_current.window_end_at <= now() then
    raise exception using errcode = '23514', message = 'Proposal input window has expired';
  end if;
  if p_target_driver_count < 0 or p_bonus_amount < 0
     or p_fare_multiplier < 1 or p_fare_multiplier > 5 then
    raise exception using errcode = '22023', message = 'Invalid revision values';
  end if;

  insert into public.proposals (
    hotspot_id, input_snapshot_id, root_proposal_id, parent_proposal_id, version,
    generator_type, generator_version, status, policy_status, target_zone_ids,
    target_geofence, source_plan, target_driver_count, offer_count,
    window_start_at, window_end_at, bonus_amount, fare_multiplier, estimated_cost,
    simulation_details, explanation, review_note
  ) values (
    v_current.hotspot_id, v_current.input_snapshot_id,
    coalesce(v_current.root_proposal_id, v_current.id), v_current.id, coalesce(v_current.version, 1) + 1,
    v_current.generator_type, v_current.generator_version, 'UNDER_REVIEW', v_current.policy_status,
    v_current.target_zone_ids, v_current.target_geofence, p_source_plan,
    p_target_driver_count, greatest(0, p_target_driver_count),
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

create or replace function public.enforce_proposal_operational_readiness()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_has_direct_move boolean;
begin
  if new.status = 'APPROVED' and new.status is distinct from old.status then
    select exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(new.source_plan -> 'moves') = 'array'
            then new.source_plan -> 'moves'
          else '[]'::jsonb
        end
      ) as move
      where coalesce(
        nullif(move ->> 'units_to_move', '')::numeric,
        nullif(move ->> 'drivers', '')::numeric,
        nullif(move ->> 'quantity', '')::numeric,
        0
      ) > 0
    ) into v_has_direct_move;
    if new.policy_status <> 'PASSED'
       or (
         not v_has_direct_move
         and (
           coalesce(new.target_driver_count, 0) < 1
           or coalesce(new.bonus_amount, 0) <= 0
           or coalesce(new.estimated_cost, 0) <= 0
         )
       )
       or jsonb_path_exists(coalesce(new.simulation_details, '{}'::jsonb),
            '$.warnings[*] ? (@.code == "NO_SOLUTION")') then
      raise exception using errcode = '23514', message = 'Proposal has no valid operational plan';
    end if;
  end if;
  return new;
end;
$$;

-- Net state of 20260812220000_reassert_five_minute_forecast_contract.sql.
alter table public.ai_zone_forecasts
  drop constraint if exists ai_zone_forecasts_horizon_min_check;
alter table public.ai_zone_forecasts
  add constraint ai_zone_forecasts_horizon_min_check
  check (horizon_min in (5, 15, 30)) not valid;
alter table public.ai_zone_forecasts
  validate constraint ai_zone_forecasts_horizon_min_check;

alter table public.model_outputs
  drop constraint if exists model_outputs_horizon_min_check;
alter table public.model_outputs
  add constraint model_outputs_horizon_min_check
  check (horizon_min in (5, 15, 30)) not valid;
alter table public.model_outputs
  validate constraint model_outputs_horizon_min_check;

comment on table public.ai_zone_forecasts is
  'Per-zone forecasts at real model horizons t+5, t+15, and t+30.';
comment on table public.model_outputs is
  'Model execution output at real horizons t+5, t+15, and t+30.';

do $postcheck$
declare
  v_forecast_check text;
  v_output_check text;
begin
  select pg_get_constraintdef(oid) into v_forecast_check
  from pg_constraint where conname = 'ai_zone_forecasts_horizon_min_check';
  select pg_get_constraintdef(oid) into v_output_check
  from pg_constraint where conname = 'model_outputs_horizon_min_check';
  if v_forecast_check !~ '(^|[^0-9])5([^0-9]|$)'
     or v_output_check !~ '(^|[^0-9])5([^0-9]|$)' then
    raise exception 'Repair post-check failed: five-minute horizon is absent';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns'
      and column_name = 'display_area_name' and data_type = 'text'
  ) then
    raise exception 'Repair post-check failed: display_area_name is not text';
  end if;
  if pg_get_functiondef(to_regprocedure('public.reconcile_campaign_lifecycle(text)')) not like '%TARGET_REACHED%'
     or pg_get_functiondef(to_regprocedure('public.revise_proposal(uuid,uuid,jsonb,integer,numeric,numeric,text)'))
        not like '%greatest(0, p_target_driver_count)%'
     or pg_get_functiondef(to_regprocedure('public.enforce_proposal_operational_readiness()'))
        not like '%v_has_direct_move%' then
    raise exception 'Repair post-check failed: function contracts do not match';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ) then
    raise exception 'Repair post-check failed: a public table has RLS disabled';
  end if;
end
$postcheck$;

commit;
