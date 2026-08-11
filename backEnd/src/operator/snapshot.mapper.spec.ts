import { mapSnapshotZone } from './snapshot.mapper';

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
});
