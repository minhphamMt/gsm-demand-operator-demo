-- The +5 replay is an operational horizon, not a UI-only interpolation.
-- Re-assert this under a new migration version because environments that
-- predated 20260812023000 can still retain the original (15, 30) checks.
begin;

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

commit;
