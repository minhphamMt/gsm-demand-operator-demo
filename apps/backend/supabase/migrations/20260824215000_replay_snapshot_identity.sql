begin;

-- Replay snapshots have two clocks: captured_at records when the API ingested
-- the bucket, while source_at is the immutable bucket in the frozen dataset.
-- A source bucket is the replay identity; it must never be materialized twice.
alter table public.supply_demand_snapshots
  add column if not exists source_at timestamptz;

-- Keep legacy duplicates for audit/provenance. Only the earliest materialized
-- header for a replay source receives source_at, making it the canonical row
-- without deleting proposals, model inputs or forecast history that reference
-- the duplicate headers.
with replay_headers as (
  select distinct on (observations.source_name, observations.snapshot_id)
    observations.snapshot_id,
    regexp_replace(observations.source_name, '^AI_(PARQUET|BRANCH_TEST)_REPLAY:', '')::timestamptz as source_at,
    snapshots.captured_at,
    snapshots.created_at
  from public.ai_zone_observations observations
  join public.supply_demand_snapshots snapshots on snapshots.id = observations.snapshot_id
  where observations.source_name ~ '^AI_(PARQUET|BRANCH_TEST)_REPLAY:'
  order by observations.source_name, observations.snapshot_id
), canonical_replay_headers as (
  select distinct on (source_at) snapshot_id, source_at
  from replay_headers
  order by source_at, captured_at, created_at, snapshot_id
)
update public.supply_demand_snapshots snapshots
set source_at = canonical_replay_headers.source_at
from canonical_replay_headers
where snapshots.id = canonical_replay_headers.snapshot_id
  and snapshots.source_at is null;

create unique index if not exists supply_demand_snapshots_replay_source_at_unique
  on public.supply_demand_snapshots (source_at)
  where data_source = 'AI_PARQUET_DATASET' and source_at is not null;

alter table public.supply_demand_snapshots
  add column if not exists effective_at timestamptz
  generated always as (coalesce(source_at, captured_at)) stored;

create index if not exists supply_demand_snapshots_effective_at_idx
  on public.supply_demand_snapshots (effective_at desc, captured_at desc, id desc);

comment on column public.supply_demand_snapshots.source_at is
  'Immutable source bucket for replay datasets. Null for non-replay and preserved duplicate legacy headers.';
comment on column public.supply_demand_snapshots.effective_at is
  'Chronological snapshot time: replay source_at when present, otherwise captured_at.';

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
      and snapshots.source_at = p_source_at;
    if not found then
      raise exception using errcode = 'P0002', message = 'Replay snapshot conflict could not be resolved';
    end if;
    return query select
      v_snapshot.id, v_snapshot.captured_at, v_snapshot.source_at, v_snapshot.data_source,
      v_snapshot.scenario_code, v_snapshot.total_demand, v_snapshot.total_supply, false;
    return;
  end if;

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
  from jsonb_array_elements(p_zones) as zone(value);

  -- A run is stale only when its snapshot is earlier in the real replay/live
  -- timeline. IDs remain a deterministic tie-breaker elsewhere, never the
  -- source of chronology.
  update public.forecast_runs runs
  set status = 'SUPERSEDED', superseded_at = now()
  from public.supply_demand_snapshots previous_snapshots
  where runs.snapshot_id = previous_snapshots.id
    and runs.status in ('COMPLETED', 'FALLBACK')
    and previous_snapshots.effective_at < v_snapshot.effective_at;

  return query select
    v_snapshot.id, v_snapshot.captured_at, v_snapshot.source_at, v_snapshot.data_source,
    v_snapshot.scenario_code, v_snapshot.total_demand, v_snapshot.total_supply, true;
end;
$$;

create or replace function public.previous_snapshot_id(p_snapshot_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.supply_demand_snapshots%rowtype;
  v_previous_id bigint;
begin
  select * into v_current from public.supply_demand_snapshots where id = p_snapshot_id;
  if not found then return null; end if;

  select candidate.id into v_previous_id
  from public.supply_demand_snapshots candidate
  where candidate.id <> v_current.id
    and candidate.scenario_code is not distinct from v_current.scenario_code
    and (
      candidate.effective_at < v_current.effective_at
      or (candidate.effective_at = v_current.effective_at and candidate.captured_at < v_current.captured_at)
      or (candidate.effective_at = v_current.effective_at and candidate.captured_at = v_current.captured_at and candidate.id < v_current.id)
    )
  order by candidate.effective_at desc, candidate.captured_at desc, candidate.id desc
  limit 1;
  return v_previous_id;
end;
$$;

revoke all on function public.ingest_replay_snapshot(timestamptz, timestamptz, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_replay_snapshot(timestamptz, timestamptz, text, integer, integer, jsonb) to service_role;
revoke all on function public.previous_snapshot_id(bigint) from public, anon, authenticated;
grant execute on function public.previous_snapshot_id(bigint) to service_role;

commit;
