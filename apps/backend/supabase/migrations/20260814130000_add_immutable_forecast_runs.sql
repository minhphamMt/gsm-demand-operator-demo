begin;

create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id bigint not null references public.supply_demand_snapshots(id) on delete cascade,
  horizon_min smallint not null check (horizon_min in (5, 15, 30)),
  model_version text not null,
  feature_version text not null,
  policy_version text not null,
  input_hash text not null,
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FALLBACK', 'FAILED', 'SUPERSEDED')),
  forecast_mode text,
  data_source text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  error_message text,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists forecast_runs_snapshot_status_idx
  on public.forecast_runs (snapshot_id, status, started_at desc);

alter table public.ai_zone_forecasts
  add column if not exists forecast_run_id uuid references public.forecast_runs(id) on delete cascade;

-- Preserve every legacy persisted forecast under an explicit immutable run
-- before replacing the snapshot/zone/horizon primary key.
with legacy_groups as (
  select distinct on (snapshot_id, horizon_min, model_version, forecast_at)
    snapshot_id, horizon_min, model_version, forecast_at, forecast_mode, data_source
  from public.ai_zone_forecasts
  where forecast_run_id is null
  order by snapshot_id, horizon_min, model_version, forecast_at
), inserted as (
  insert into public.forecast_runs (
    snapshot_id, horizon_min, model_version, feature_version, policy_version,
    input_hash, status, forecast_mode, data_source, started_at, completed_at
  )
  select snapshot_id, horizon_min, model_version, 'legacy', 'legacy',
    md5(concat_ws(':', snapshot_id::text, horizon_min::text, model_version, forecast_at::text)),
    'COMPLETED', forecast_mode, data_source, forecast_at, forecast_at
  from legacy_groups
  returning id, snapshot_id, horizon_min, model_version, started_at
)
update public.ai_zone_forecasts forecast
set forecast_run_id = run.id
from inserted run
where forecast.forecast_run_id is null
  and forecast.snapshot_id = run.snapshot_id
  and forecast.horizon_min = run.horizon_min
  and forecast.model_version = run.model_version
  and forecast.forecast_at = run.started_at;

alter table public.ai_zone_forecasts
  alter column forecast_run_id set not null;

alter table public.ai_zone_forecasts
  drop constraint if exists ai_zone_forecasts_pkey;
alter table public.ai_zone_forecasts
  add constraint ai_zone_forecasts_pkey primary key (forecast_run_id, zone_id);

create index if not exists ai_zone_forecasts_run_idx
  on public.ai_zone_forecasts (forecast_run_id, zone_id);

alter table public.forecast_runs enable row level security;
revoke all on public.forecast_runs from anon, authenticated;
grant all on public.forecast_runs to service_role;

comment on table public.forecast_runs is
  'Immutable forecast execution identity: snapshot, model, feature/policy versions, horizon and input hash.';
comment on column public.ai_zone_forecasts.forecast_run_id is
  'Immutable execution that produced this zone forecast; prevents model runs from overwriting one another.';

commit;
