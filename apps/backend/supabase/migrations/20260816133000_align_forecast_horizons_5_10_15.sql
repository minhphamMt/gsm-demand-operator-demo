begin;

alter table public.ai_zone_forecasts
  drop constraint if exists ai_zone_forecasts_horizon_min_check;
alter table public.ai_zone_forecasts
  add constraint ai_zone_forecasts_horizon_min_check
  check (horizon_min in (5, 10, 15, 30)) not valid;
alter table public.ai_zone_forecasts
  validate constraint ai_zone_forecasts_horizon_min_check;

alter table public.model_outputs
  drop constraint if exists model_outputs_horizon_min_check;
alter table public.model_outputs
  add constraint model_outputs_horizon_min_check
  check (horizon_min in (5, 10, 15, 30)) not valid;
alter table public.model_outputs
  validate constraint model_outputs_horizon_min_check;

alter table public.forecast_runs
  drop constraint if exists forecast_runs_horizon_min_check;
alter table public.forecast_runs
  add constraint forecast_runs_horizon_min_check
  check (horizon_min in (5, 10, 15, 30)) not valid;
alter table public.forecast_runs
  validate constraint forecast_runs_horizon_min_check;

comment on table public.ai_zone_forecasts is
  'Per-zone forecasts at model horizons t+5, t+10, and t+15.';
comment on table public.model_outputs is
  'Model execution output at horizons t+5, t+10, and t+15.';

commit;
