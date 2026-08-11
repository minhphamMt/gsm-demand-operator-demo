import { mapAiZone, mapSnapshotZone } from './snapshot.mapper';

describe('mapSnapshotZone', () => {
  it('keeps current demand separate from the DB forecast and does not invent confidence', () => {
    expect(mapSnapshotZone({
      h3_index: 'h3-1',
      current_demand: 18,
      predicted_demand: 27,
      available_supply: 10,
    }, { district_name: 'Hoàn Kiếm' })).toMatchObject({
      demand: 18,
      forecast15: 27,
      forecast30: 27,
      gap: 8,
      severity: 'High',
      confidence: null,
    });
  });

  it('uses persisted AI forecast horizons and exposes model confidence as a percentage', () => {
    expect(mapSnapshotZone({
      h3_index: 'h3-1',
      current_demand: 18,
      predicted_demand: 20,
      available_supply: 10,
    }, { district_name: 'Hoàn Kiếm', ai_zone_id: 2 }, {
      horizon15: { predicted_demand: 27, confidence: 0.91 },
      horizon30: { predicted_demand: 31, confidence: 0.88 },
    })).toMatchObject({
      forecast15: 27,
      forecast30: 31,
      confidence: 91,
    });
  });

  it('aggregates H3 children into the canonical AI zone returned by the DB registry', () => {
    expect(mapAiZone({
      zone_id: 2,
      zone_code: 'AI-Z02',
      zone_name: 'Hoàn Kiếm',
      center_geojson: { coordinates: [105.8542, 21.0285] },
      service_area_geojson: { coordinates: [[[105.85, 21.02], [105.86, 21.02], [105.85, 21.03], [105.85, 21.02]]] },
    }, [
      { available_supply: 4, current_demand: 8, predicted_demand: 9 },
      { available_supply: 6, current_demand: 7, predicted_demand: 10 },
    ], {
      horizon15: { predicted_demand: 21, confidence: 0.9 },
      horizon30: { predicted_demand: 23, confidence: 0.82 },
    })).toMatchObject({
      id: 'AI-Z02',
      aiZoneId: 2,
      label: 'Hoàn Kiếm',
      sourceCellCount: 2,
      dataStatus: 'live',
      supply: 10,
      demand: 15,
      gap: 5,
      forecast15: 21,
      forecast30: 23,
      confidence: 90,
    });
  });

  it('marks a registered AI zone without ingested H3 children as unavailable', () => {
    expect(mapAiZone({
      zone_id: 30,
      zone_code: 'AI-Z30',
      zone_name: 'Sơn Tây',
      center_geojson: { coordinates: [105.504, 21.14] },
      service_area_geojson: { coordinates: [] },
    }, [])).toMatchObject({
      id: 'AI-Z30',
      dataStatus: 'no_live_cells',
      sourceCellCount: 0,
      supply: 0,
      demand: 0,
    });
  });
});
