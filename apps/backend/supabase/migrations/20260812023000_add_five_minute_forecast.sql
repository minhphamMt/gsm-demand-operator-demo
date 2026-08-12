alter table public.ai_zone_forecasts
  drop constraint if exists ai_zone_forecasts_horizon_min_check;

alter table public.ai_zone_forecasts
  add constraint ai_zone_forecasts_horizon_min_check
  check (horizon_min in (5, 15, 30));

alter table public.model_outputs
  drop constraint if exists model_outputs_horizon_min_check;

alter table public.model_outputs
  add constraint model_outputs_horizon_min_check
  check (horizon_min in (5, 15, 30));

comment on table public.ai_zone_forecasts is
  'Dự báo LightGBM theo từng zone cho horizon t+5, t+15 và t+30.';
