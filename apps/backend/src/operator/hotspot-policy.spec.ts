import { deriveHotspots, hotspotPolicy } from './hotspot-policy';

describe('hotspot policy', () => {
  it('is deterministic and exposes versioned reason/features', () => {
    const input = [
      { zoneId: 'AI-Z02', demand: 13, supply: 2, forecastRunId: 'run-1' },
      { zoneId: 'AI-Z01', demand: 10, supply: 4 },
      { zoneId: 'AI-Z03', demand: null, supply: null },
    ];

    expect(deriveHotspots(input)).toEqual([
      expect.objectContaining({ zoneId: 'AI-Z02', rank: 1, severity: 'Critical', threshold: 11, forecastRunId: 'run-1', policyVersion: hotspotPolicy.version, reasonCodes: ['HIGH_DEMAND_GAP', 'SUPPLY_SHORTAGE'] }),
      expect.objectContaining({ zoneId: 'AI-Z01', rank: 2, severity: 'High', threshold: 6, reasonCodes: ['HIGH_DEMAND_GAP'] }),
    ]);
    expect(deriveHotspots(input)).toEqual(deriveHotspots(input));
  });

  it('holds severity around an exit threshold until hysteresis is crossed', () => {
    expect(deriveHotspots([{ zoneId: 'AI-Z01', demand: 10, supply: 5, previousSeverity: 'High' }]))
      .toEqual([expect.objectContaining({ severity: 'High', threshold: 4, isPersistent: true })]);
    expect(deriveHotspots([{ zoneId: 'AI-Z01', demand: 10, supply: 7, previousSeverity: 'High' }]))
      .toEqual([]);
  });
});
