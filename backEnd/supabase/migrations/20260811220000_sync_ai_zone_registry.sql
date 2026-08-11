-- Keep the database zone catalog byte-for-byte aligned with AI/config/zone_registry.json.
-- H3 cells remain optional children of a canonical AI zone; the dashboard reads this
-- registry so zones without live cells are visible as "no data", never fabricated as 0.
begin;

alter table public.ai_zone_registry
  add column if not exists zone_code text,
  add column if not exists area_km2 numeric,
  add column if not exists population_k numeric,
  add column if not exists population_density numeric,
  add column if not exists radius_m integer,
  add column if not exists building_count integer,
  add column if not exists building_density numeric,
  add column if not exists center_point geography(Point, 4326),
  add column if not exists service_area geography(Polygon, 4326);

alter table public.ai_zone_forecasts
  add column if not exists forecast_mode text,
  add column if not exists data_source text;

insert into public.ai_zone_registry (
  zone_id, zone_code, zone_name, tier, center_lat, center_lng, area_km2,
  population_k, population_density, radius_m, building_count, building_density, is_active
) values
  (1,  'AI-Z01', 'Ba Đình',       'high',   21.0343, 105.8142, 9.25,   242.8, 26248.6, 1716, 7116,  0.156, true),
  (2,  'AI-Z02', 'Hoàn Kiếm',     'high',   21.0285, 105.8542, 5.29,   155.9, 29470.7, 1298, 7775,  0.171, true),
  (3,  'AI-Z03', 'Hai Bà Trưng',  'high',   21.0110, 105.8550, 10.09,  315.9, 31308.2, 1792, 7759,  0.170, true),
  (4,  'AI-Z04', 'Đống Đa',       'high',   21.0150, 105.8270, 9.96,   401.7, 40331.3, 1781, 5380,  0.118, true),
  (5,  'AI-Z05', 'Tây Hồ',        'medium', 21.0680, 105.8200, 24.01,  152.8, 6364.0,  2765, 1594,  0.035, true),
  (6,  'AI-Z06', 'Cầu Giấy',      'high',   21.0360, 105.7900, 12.03,  251.8, 20931.0, 1957, 12850, 0.282, true),
  (7,  'AI-Z07', 'Thanh Xuân',    'high',   20.9950, 105.8050, 9.08,   266.0, 29295.2, 1700, 12284, 0.270, true),
  (8,  'AI-Z08', 'Hoàng Mai',     'medium', 20.9750, 105.8500, 40.32,  364.9, 9050.1,  3582, 2881,  0.063, true),
  (9,  'AI-Z09', 'Long Biên',     'medium', 21.0450, 105.8890, 59.93,  270.3, 4510.3,  4368, 45552, 1.000, true),
  (10, 'AI-Z10', 'Bắc Từ Liêm',  'medium', 21.0730, 105.7550, 43.35,  320.4, 7391.0,  3715, 3718,  0.082, true),
  (11, 'AI-Z11', 'Nam Từ Liêm',  'medium', 21.0020, 105.7620, 32.27,  232.9, 7217.2,  3205, 4964,  0.109, true),
  (12, 'AI-Z12', 'Hà Đông',       'medium', 20.9700, 105.7780, 48.34,  284.5, 5885.4,  3923, 1861,  0.041, true),
  (13, 'AI-Z13', 'Thanh Trì',     'medium', 20.9330, 105.8420, 62.93,  221.8, 3524.6,  4476, 3022,  0.066, true),
  (14, 'AI-Z14', 'Gia Lâm',       'low',    21.0300, 105.9350, 114.73, 253.8, 2212.2,  5000, 33091, 0.726, true),
  (15, 'AI-Z15', 'Đông Anh',      'low',    21.1450, 105.8500, 182.14, 374.9, 2058.3,  5000, 5506,  0.121, true),
  (16, 'AI-Z16', 'Sóc Sơn',       'low',    21.2570, 105.8420, 306.51, 316.6, 1032.9,  5000, 1736,  0.038, true),
  (17, 'AI-Z17', 'Ba Vì',         'low',    21.1780, 105.4260, 424.03, 267.3, 630.4,   5000, 1981,  0.043, true),
  (18, 'AI-Z18', 'Phúc Thọ',      'low',    21.1150, 105.5570, 117.19, 172.5, 1472.0,  5000, 157,   0.003, true),
  (19, 'AI-Z19', 'Thạch Thất',    'low',    21.0930, 105.5590, 184.59, 194.1, 1051.5,  5000, 420,   0.009, true),
  (20, 'AI-Z20', 'Quốc Oai',      'low',    20.9990, 105.6250, 147.91, 174.2, 1177.7,  5000, 143,   0.003, true),
  (21, 'AI-Z21', 'Chương Mỹ',     'low',    20.9080, 105.6720, 232.41, 309.6, 1332.1,  5000, 2921,  0.064, true),
  (22, 'AI-Z22', 'Đan Phượng',    'low',    21.0940, 105.6790, 77.35,  154.3, 1994.8,  4962, 974,   0.021, true),
  (23, 'AI-Z23', 'Hoài Đức',      'low',    21.0270, 105.6900, 82.47,  212.1, 2571.8,  5000, 1651,  0.036, true),
  (24, 'AI-Z24', 'Thanh Oai',     'low',    20.8580, 105.7530, 123.85, 185.4, 1497.0,  5000, 93,    0.002, true),
  (25, 'AI-Z25', 'Mỹ Đức',        'low',    20.6900, 105.7350, 226.20, 183.5, 811.2,   5000, 455,   0.010, true),
  (26, 'AI-Z26', 'Ứng Hòa',       'low',    20.7290, 105.7810, 183.75, 191.7, 1043.3,  5000, 104,   0.002, true),
  (27, 'AI-Z27', 'Thường Tín',    'low',    20.8710, 105.8620, 127.39, 236.3, 1854.9,  5000, 1692,  0.037, true),
  (28, 'AI-Z28', 'Phú Xuyên',     'low',    20.7420, 105.9060, 171.10, 187.0, 1092.9,  5000, 145,   0.003, true),
  (29, 'AI-Z29', 'Mê Linh',       'low',    21.1850, 105.7280, 142.51, 210.6, 1477.8,  5000, 4220,  0.093, true),
  (30, 'AI-Z30', 'Sơn Tây',       'low',    21.1400, 105.5040, 113.53, 136.6, 1203.2,  5000, 30025, 0.659, true)
on conflict (zone_id) do update set
  zone_code = excluded.zone_code,
  zone_name = excluded.zone_name,
  tier = excluded.tier,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  area_km2 = excluded.area_km2,
  population_k = excluded.population_k,
  population_density = excluded.population_density,
  radius_m = excluded.radius_m,
  building_count = excluded.building_count,
  building_density = excluded.building_density,
  is_active = excluded.is_active;

update public.ai_zone_registry
set
  center_point = st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography,
  service_area = st_buffer(
    st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography,
    radius_m
  );

alter table public.ai_zone_registry alter column zone_code set not null;
create unique index if not exists ai_zone_registry_code_uidx
  on public.ai_zone_registry (zone_code);

-- Rebuild the deterministic district-name bridge, including existing rows. This
-- intentionally does not invent H3 cells for the 23 zones not yet ingested.
update public.h3_cells cells
set ai_zone_id = zones.zone_id
from public.ai_zone_registry zones
where lower(trim(cells.district_name)) = lower(trim(zones.zone_name));

create or replace view public.ai_zone_registry_api_v
with (security_invoker = true)
as
select
  zone_id,
  zone_code,
  zone_name,
  tier,
  center_lat,
  center_lng,
  area_km2,
  population_k,
  population_density,
  radius_m,
  building_count,
  building_density,
  is_active,
  st_asgeojson(center_point::geometry)::jsonb as center_geojson,
  st_asgeojson(service_area::geometry)::jsonb as service_area_geojson
from public.ai_zone_registry;

grant select on public.ai_zone_registry_api_v to authenticated, service_role;

comment on view public.ai_zone_registry_api_v is
  'Canonical dashboard geometry and metadata copied from AI/config/zone_registry.json.';

commit;
