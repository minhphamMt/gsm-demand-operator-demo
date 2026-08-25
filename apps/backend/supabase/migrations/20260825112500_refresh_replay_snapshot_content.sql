begin;

-- A replay bucket keeps a stable database identity, while its checksummed
-- dataset content may receive an explicitly deployed calibration revision.
-- Refresh the canonical cache atomically and supersede forecasts made from
-- the previous content. Model input/output ledgers remain immutable.
create or replace function public.ingest_replay_snapshot(
  p_captured_at timestamptz,
  p_source_at timestamptz,
  p_scenario_code text,
  p_total_demand integer,
  p_total_supply integer,
  p_zones jsonb
)
returns table (
  id bigint,
  captured_at timestamptz,
  source_at timestamptz,
  data_source varchar,
  scenario_code varchar,
  total_demand integer,
  total_supply integer,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.supply_demand_snapshots%rowtype;
  v_created boolean := false;
  v_changed boolean := false;
  v_zone_count integer;
  v_distinct_zone_count integer;
  v_min_zone smallint;
  v_max_zone smallint;
  v_source_name text;
begin
  if p_source_at is null
     or date_trunc('minute', p_source_at) <> p_source_at
     or extract(minute from p_source_at)::integer % 5 <> 0 then
    raise exception using errcode = '22023', message = 'Replay source timestamp must be a five-minute bucket';
  end if;
  if p_captured_at is null
     or date_trunc('minute', p_captured_at) <> p_captured_at
     or extract(minute from p_captured_at)::integer % 5 <> 0 then
    raise exception using errcode = '22023', message = 'Captured timestamp must be a five-minute bucket';
  end if;
  if p_zones is null or coalesce(jsonb_typeof(p_zones), '') <> 'array' then
    raise exception using errcode = '22023', message = 'Replay zones must be a JSON array';
  end if;

  select count(*), count(distinct (zone.value ->> 'zone_id')::smallint),
         min((zone.value ->> 'zone_id')::smallint), max((zone.value ->> 'zone_id')::smallint)
  into v_zone_count, v_distinct_zone_count, v_min_zone, v_max_zone
  from jsonb_array_elements(p_zones) as zone(value);
  if v_zone_count <> 30 or v_distinct_zone_count <> 30 or v_min_zone <> 1 or v_max_zone <> 30 then
    raise exception using errcode = '22023', message = 'Replay snapshot must contain exactly one record for each zone 1..30';
  end if;

  insert into public.supply_demand_snapshots (
    captured_at, source_at, data_source, scenario_code, total_demand, total_supply
  ) values (
    p_captured_at, p_source_at, 'AI_PARQUET_DATASET', upper(p_scenario_code), p_total_demand, p_total_supply
  ) on conflict do nothing
  returning * into v_snapshot;
  v_created := found;

  if not v_created then
    select * into v_snapshot
    from public.supply_demand_snapshots snapshots
    where snapshots.data_source = 'AI_PARQUET_DATASET'
      and snapshots.source_at = p_source_at
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Replay snapshot conflict could not be resolved';
    end if;

    select
      v_snapshot.total_demand is distinct from p_total_demand
      or v_snapshot.total_supply is distinct from p_total_supply
      or v_snapshot.scenario_code is distinct from upper(p_scenario_code)
      or count(observations.zone_id) <> 30
      or bool_or(
        observations.zone_id is null
        or observations.demand_observed is distinct from (zone.value ->> 'demand_observed')::integer
        or observations.idle_supply is distinct from (zone.value ->> 'idle_supply')::integer
        or observations.enroute_supply is distinct from (zone.value ->> 'enroute_supply')::integer
        or observations.rain_mm_h is distinct from (zone.value ->> 'rain_mm_h')::numeric
        or observations.rain_forecast_15 is distinct from (zone.value ->> 'rain_forecast_15')::numeric
        or observations.rain_forecast_30 is distinct from (zone.value ->> 'rain_forecast_30')::numeric
        or observations.peak_flag is distinct from (zone.value ->> 'peak_flag')::smallint
        or observations.holiday_flag is distinct from (zone.value ->> 'holiday_flag')::smallint
      )
    into v_changed
    from jsonb_array_elements(p_zones) as zone(value)
    left join public.ai_zone_observations observations
      on observations.snapshot_id = v_snapshot.id
     and observations.zone_id = (zone.value ->> 'zone_id')::smallint;
  else
    v_changed := true;
  end if;

  if not v_changed then
    return query select
      v_snapshot.id, v_snapshot.captured_at, v_snapshot.source_at, v_snapshot.data_source,
      v_snapshot.scenario_code, v_snapshot.total_demand, v_snapshot.total_supply, false;
    return;
  end if;

  update public.supply_demand_snapshots
  set captured_at = p_captured_at,
      scenario_code = upper(p_scenario_code),
      total_demand = p_total_demand,
      total_supply = p_total_supply
  where supply_demand_snapshots.id = v_snapshot.id
  returning * into v_snapshot;

  v_source_name := 'AI_PARQUET_REPLAY:'
    || to_char(p_source_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.ai_zone_observations (
    snapshot_id, zone_id, demand_observed, idle_supply, enroute_supply,
    rain_mm_h, rain_forecast_15, rain_forecast_30, peak_flag, holiday_flag,
    data_status, source_name, source_updated_at
  )
  select
    v_snapshot.id,
    (zone.value ->> 'zone_id')::smallint,
    (zone.value ->> 'demand_observed')::integer,
    (zone.value ->> 'idle_supply')::integer,
    (zone.value ->> 'enroute_supply')::integer,
    (zone.value ->> 'rain_mm_h')::numeric,
    (zone.value ->> 'rain_forecast_15')::numeric,
    (zone.value ->> 'rain_forecast_30')::numeric,
    (zone.value ->> 'peak_flag')::smallint,
    (zone.value ->> 'holiday_flag')::smallint,
    'live', v_source_name, p_captured_at
  from jsonb_array_elements(p_zones) as zone(value)
  on conflict (snapshot_id, zone_id) do update set
    demand_observed = excluded.demand_observed,
    idle_supply = excluded.idle_supply,
    enroute_supply = excluded.enroute_supply,
    rain_mm_h = excluded.rain_mm_h,
    rain_forecast_15 = excluded.rain_forecast_15,
    rain_forecast_30 = excluded.rain_forecast_30,
    peak_flag = excluded.peak_flag,
    holiday_flag = excluded.holiday_flag,
    data_status = excluded.data_status,
    source_name = excluded.source_name,
    source_updated_at = excluded.source_updated_at;

  update public.forecast_runs
  set status = 'SUPERSEDED', superseded_at = now()
  where snapshot_id = v_snapshot.id
    and status in ('COMPLETED', 'FALLBACK');

  update public.forecast_runs runs
  set status = 'SUPERSEDED', superseded_at = now()
  from public.supply_demand_snapshots previous_snapshots
  where runs.snapshot_id = previous_snapshots.id
    and runs.status in ('COMPLETED', 'FALLBACK')
    and previous_snapshots.effective_at < v_snapshot.effective_at;

  return query select
    v_snapshot.id, v_snapshot.captured_at, v_snapshot.source_at, v_snapshot.data_source,
    v_snapshot.scenario_code, v_snapshot.total_demand, v_snapshot.total_supply, v_created;
end;
$$;

revoke all on function public.ingest_replay_snapshot(timestamptz, timestamptz, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_replay_snapshot(timestamptz, timestamptz, text, integer, integer, jsonb) to service_role;

commit;
