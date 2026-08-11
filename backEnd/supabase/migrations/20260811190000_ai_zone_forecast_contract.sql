-- Bridge the AI branch's district-level zone contract (zone_id 1..30) to the
-- H3 cells consumed by the operator web application.
begin;

create table if not exists public.ai_zone_registry (
  zone_id smallint primary key check (zone_id between 1 and 30),
  zone_name text not null unique,
  tier text not null check (tier in ('high', 'medium', 'low')),
  center_lat double precision not null,
  center_lng double precision not null,
  is_active boolean not null default true
);

insert into public.ai_zone_registry (zone_id, zone_name, tier, center_lat, center_lng) values
  (1, 'Ba Đình', 'high', 21.0343, 105.8142),
  (2, 'Hoàn Kiếm', 'high', 21.0285, 105.8542),
  (3, 'Hai Bà Trưng', 'high', 21.0110, 105.8550),
  (4, 'Đống Đa', 'high', 21.0150, 105.8270),
  (5, 'Tây Hồ', 'medium', 21.0680, 105.8200),
  (6, 'Cầu Giấy', 'high', 21.0360, 105.7900),
  (7, 'Thanh Xuân', 'high', 20.9950, 105.8050),
  (8, 'Hoàng Mai', 'medium', 20.9750, 105.8500),
  (9, 'Long Biên', 'medium', 21.0450, 105.8890),
  (10, 'Bắc Từ Liêm', 'medium', 21.0730, 105.7550),
  (11, 'Nam Từ Liêm', 'medium', 21.0020, 105.7620),
  (12, 'Hà Đông', 'medium', 20.9700, 105.7780),
  (13, 'Thanh Trì', 'medium', 20.9330, 105.8420),
  (14, 'Gia Lâm', 'low', 21.0300, 105.9350),
  (15, 'Đông Anh', 'low', 21.1450, 105.8500),
  (16, 'Sóc Sơn', 'low', 21.2570, 105.8420),
  (17, 'Ba Vì', 'low', 21.1780, 105.4260),
  (18, 'Phúc Thọ', 'low', 21.1150, 105.5570),
  (19, 'Thạch Thất', 'low', 21.0930, 105.5590),
  (20, 'Quốc Oai', 'low', 20.9990, 105.6250),
  (21, 'Chương Mỹ', 'low', 20.9080, 105.6720),
  (22, 'Đan Phượng', 'low', 21.0940, 105.6790),
  (23, 'Hoài Đức', 'low', 21.0270, 105.6900),
  (24, 'Thanh Oai', 'low', 20.8580, 105.7530),
  (25, 'Mỹ Đức', 'low', 20.6900, 105.7350),
  (26, 'Ứng Hòa', 'low', 20.7290, 105.7810),
  (27, 'Thường Tín', 'low', 20.8710, 105.8620),
  (28, 'Phú Xuyên', 'low', 20.7420, 105.9060),
  (29, 'Mê Linh', 'low', 21.1850, 105.7280),
  (30, 'Sơn Tây', 'low', 21.1400, 105.5040)
on conflict (zone_id) do update set
  zone_name = excluded.zone_name,
  tier = excluded.tier,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng;

alter table public.h3_cells
  add column if not exists ai_zone_id smallint references public.ai_zone_registry(zone_id);

-- District names already stored by the map are the safest deterministic bridge.
-- More than one H3 cell may belong to one AI zone, so ai_zone_id is intentionally
-- indexed but not unique.
update public.h3_cells cells
set ai_zone_id = zones.zone_id
from public.ai_zone_registry zones
where cells.ai_zone_id is null
  and lower(trim(cells.district_name)) = lower(trim(zones.zone_name));

create index if not exists h3_cells_ai_zone_idx
  on public.h3_cells (ai_zone_id) where ai_zone_id is not null;

create or replace view public.h3_cells_api_v
with (security_invoker = true)
as
select
  h.*,
  st_asgeojson(h.center_point::geometry)::jsonb as center_geojson,
  st_asgeojson(h.boundary::geometry)::jsonb as boundary_geojson
from public.h3_cells h;

create table if not exists public.ai_zone_forecasts (
  snapshot_id bigint not null references public.supply_demand_snapshots(id) on delete cascade,
  zone_id smallint not null references public.ai_zone_registry(zone_id),
  horizon_min smallint not null check (horizon_min in (15, 30)),
  forecast_at timestamptz not null,
  regime text not null check (regime in ('normal', 'peak', 'rain', 'rain_peak')),
  model_version text not null,
  predicted_demand numeric not null check (predicted_demand >= 0),
  predicted_supply numeric not null check (predicted_supply >= 0),
  demand_p10 numeric not null check (demand_p10 >= 0),
  demand_p90 numeric not null check (demand_p90 >= 0),
  supply_p10 numeric not null check (supply_p10 >= 0),
  supply_p90 numeric not null check (supply_p90 >= 0),
  confidence numeric check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (snapshot_id, zone_id, horizon_min),
  constraint ai_forecast_demand_quantiles check (demand_p10 <= predicted_demand and predicted_demand <= demand_p90),
  constraint ai_forecast_supply_quantiles check (supply_p10 <= predicted_supply and predicted_supply <= supply_p90)
);

create index if not exists ai_zone_forecasts_time_idx
  on public.ai_zone_forecasts (forecast_at desc, horizon_min);
create index if not exists ai_zone_forecasts_zone_idx
  on public.ai_zone_forecasts (zone_id, forecast_at desc);

alter table public.ai_zone_registry enable row level security;
alter table public.ai_zone_forecasts enable row level security;
revoke all on public.ai_zone_registry, public.ai_zone_forecasts from anon, authenticated;
grant all on public.ai_zone_registry, public.ai_zone_forecasts to service_role;
grant select on public.h3_cells_api_v to authenticated, service_role;

comment on table public.ai_zone_registry is
  'Canonical zone_id 1..30 from origin/AI config/zone_registry.json.';
comment on column public.h3_cells.ai_zone_id is
  'District-level AI zone owning this web H3 cell; nullable until explicitly mapped.';
comment on table public.ai_zone_forecasts is
  'Validated Model 1 quantile output. Model 2 and the operator API read the same persisted forecast.';

commit;
