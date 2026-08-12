import { mapAiZone } from './snapshot.mapper';

const zone = {
  area_km2: 5.29,
  zone_id: 2,
  zone_code: 'AI-Z02',
  zone_name: 'Hoàn Kiếm',
  center_geojson: { coordinates: [105.8542, 21.0285] },
  service_area_geojson: { coordinates: [[[105.85, 21.02], [105.86, 21.02], [105.85, 21.03], [105.85, 21.02]]] },
};

describe('mapAiZone', () => {
  it('maps the canonical DB zone observation and AI forecasts without H3', () => {
    expect(mapAiZone(zone, { data_status: 'live', idle_supply: 10, demand_observed: 15, rain_mm_h: 0.4, rain_forecast_15: 0.8, rain_forecast_30: 1.2 }, {
      horizon5: { predicted_demand: 18, predicted_supply: 12 },
      horizon15: { predicted_demand: 21, predicted_supply: 14, demand_p10: 18, demand_p90: 25, supply_p10: 11, supply_p90: 17, confidence: 0.9 },
      horizon30: { predicted_demand: 23, predicted_supply: 16, demand_p10: 19, demand_p90: 27, supply_p10: 13, supply_p90: 19, confidence: 0.82 },
    })).toMatchObject({
      id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', dataStatus: 'live',
      supply: 10, demand: 15, gap: 5, forecast5: 18, forecastSupply5: 12, forecast15: 21, forecast30: 23,
      forecastSupply15: 14, forecastSupply30: 16, confidence: 90,
      areaKm2: 5.29, rainMmH: 0.4, rainForecast15: 0.8, rainForecast30: 1.2,
    });
  });

  it('keeps a materialized zone record unavailable until real observations arrive', () => {
    expect(mapAiZone({ ...zone, zone_id: 30, zone_code: 'AI-Z30', zone_name: 'Sơn Tây' }, { data_status: 'missing' })).toMatchObject({
      id: 'AI-Z30', dataStatus: 'missing', supply: 0, demand: 0,
    });
  });
});
