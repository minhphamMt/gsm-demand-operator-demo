-- Real inference inputs required by the AI branch's Snapshot contract.
begin;

alter table public.supply_demand_cells
  add column if not exists enroute_supply integer,
  add column if not exists rain_mm_h numeric,
  add column if not exists rain_forecast_15 numeric,
  add column if not exists rain_forecast_30 numeric,
  add column if not exists peak_flag smallint,
  add column if not exists holiday_flag smallint;

alter table public.supply_demand_cells
  add constraint supply_demand_cells_enroute_nonnegative check (enroute_supply is null or enroute_supply >= 0),
  add constraint supply_demand_cells_rain_nonnegative check (
    (rain_mm_h is null or rain_mm_h >= 0)
    and (rain_forecast_15 is null or rain_forecast_15 >= 0)
    and (rain_forecast_30 is null or rain_forecast_30 >= 0)
  ),
  add constraint supply_demand_cells_peak_flag check (peak_flag is null or peak_flag in (0, 1)),
  add constraint supply_demand_cells_holiday_flag check (holiday_flag is null or holiday_flag in (0, 1));

comment on column public.supply_demand_cells.rain_mm_h is 'Observed rain input; must not be synthesized by the API.';
comment on column public.supply_demand_cells.rain_forecast_15 is 'External 15-minute rain nowcast for Model 1.';
comment on column public.supply_demand_cells.rain_forecast_30 is 'External 30-minute rain nowcast for Model 1.';

commit;
