import { calculateSnapshotKpis, mapAiZone } from './snapshot.mapper';

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
      horizon5: { predicted_demand: 18, predicted_supply: 12, demand_p10: 16, demand_p90: 20, supply_p10: 10, supply_p90: 14, confidence: 0.95 },
      horizon10: { predicted_demand: 20, predicted_supply: 13, demand_p10: 17, demand_p90: 23, supply_p10: 11, supply_p90: 15, confidence: 0.92 },
      horizon15: { predicted_demand: 21, predicted_supply: 14, demand_p10: 18, demand_p90: 25, supply_p10: 11, supply_p90: 17, confidence: 0.9 },
    })).toMatchObject({
      id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', dataStatus: 'live',
      supply: 10, demand: 15, gap: 5, forecast5: 18, forecastSupply5: 12, forecast10: 20, forecastSupply10: 13, forecast15: 21, forecast30: 21,
      forecastSupply15: 14, forecastSupply30: 14, confidence: 95, confidence5: 95, confidence10: 92, confidence15: 90, confidence30: null,
      demandRange5: [16, 20], supplyRange5: [10, 14],
      areaKm2: 5.29, rainMmH: 0.4, rainForecast15: 0.8, rainForecast30: 1.2,
    });
  });

  it('keeps a materialized zone record unavailable until real observations arrive', () => {
    expect(mapAiZone({ ...zone, zone_id: 30, zone_code: 'AI-Z30', zone_name: 'Sơn Tây' }, { data_status: 'missing' })).toMatchObject({
      id: 'AI-Z30', dataStatus: 'missing', supply: null, demand: null, gap: null, severity: 'Unknown',
    });
  });
});

describe('calculateSnapshotKpis', () => {
  it('uses the canonical per-zone unmet and demand-weighted wait formulas', () => {
    const result = calculateSnapshotKpis([
      { data_status: 'live', demand_observed: 10, idle_supply: 0 },
      { data_status: 'live', demand_observed: 10, idle_supply: 20 },
    ]);

    // Aggregate demand equals aggregate supply, but the first zone still lacks 10 cars.
    expect(result).toMatchObject({
      fleetAvailable: 20,
      fulfillmentRate: 50,
      requests: 20,
      residualGap: 10,
    });
    expect(result.avgWaitProxy).toBeCloseTo(47.964, 3);
  });

  it('does not turn missing observations into demand or supply', () => {
    expect(calculateSnapshotKpis([
      { data_status: 'missing', demand_observed: 99, idle_supply: 99 },
    ])).toEqual({
      avgWaitProxy: 0,
      fleetAvailable: 0,
      fulfillmentRate: 100,
      requests: 0,
      residualGap: 0,
    });
  });
});
