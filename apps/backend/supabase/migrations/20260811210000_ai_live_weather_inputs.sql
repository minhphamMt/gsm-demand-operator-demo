-- One operational record per canonical AI zone and snapshot. H3 is deliberately
-- absent from this contract: DB, inference and UI all share zone_id 1..30.
begin;

create table if not exists public.ai_zone_observations (
  snapshot_id bigint not null references public.supply_demand_snapshots(id) on delete cascade,
  zone_id smallint not null references public.ai_zone_registry(zone_id),
  demand_observed integer check (demand_observed is null or demand_observed >= 0),
  idle_supply integer check (idle_supply is null or idle_supply >= 0),
  enroute_supply integer check (enroute_supply is null or enroute_supply >= 0),
  rain_mm_h numeric check (rain_mm_h is null or rain_mm_h >= 0),
  rain_forecast_15 numeric check (rain_forecast_15 is null or rain_forecast_15 >= 0),
  rain_forecast_30 numeric check (rain_forecast_30 is null or rain_forecast_30 >= 0),
  peak_flag smallint check (peak_flag is null or peak_flag in (0, 1)),
  holiday_flag smallint check (holiday_flag is null or holiday_flag in (0, 1)),
  data_status text not null default 'missing' check (data_status in ('live', 'missing')),
  source_name text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, zone_id),
  constraint ai_zone_observation_live_complete check (
    data_status = 'missing' or (
      demand_observed is not null and idle_supply is not null and enroute_supply is not null
      and rain_mm_h is not null and rain_forecast_15 is not null and rain_forecast_30 is not null
      and peak_flag is not null and holiday_flag is not null
    )
  )
);

-- Materialize exactly 30 zone records for every existing snapshot. Missing source
-- values remain NULL and are visibly unavailable; the migration never invents demand.
insert into public.ai_zone_observations (snapshot_id, zone_id, data_status, source_name)
select snapshots.id, zones.zone_id, 'missing', 'awaiting_zone_ingestion'
from public.supply_demand_snapshots snapshots
cross join public.ai_zone_registry zones
on conflict (snapshot_id, zone_id) do nothing;

create index if not exists ai_zone_observations_zone_time_idx
  on public.ai_zone_observations (zone_id, snapshot_id desc);

alter table public.ai_zone_observations enable row level security;
revoke all on public.ai_zone_observations from anon, authenticated;
grant all on public.ai_zone_observations to service_role;

comment on table public.ai_zone_observations is
  'Sole live input for AI and operator map: exactly one row per snapshot and AI zone_id 1..30.';

commit;
