import { describe, expect, it } from 'vitest'

import { simulateSnapshot } from '@/features/operator-data/model/mockSnapshotEngine'
import { createZones } from '@/features/operator-data/model/zoneGeometry'

describe('mock snapshot engine', () => {
  it('keeps a realistic and explainable rain-peak baseline', () => {
    const snapshot = simulateSnapshot(createZones(), { comparison: 'baseline', gain: 0, regime: 'rain_peak', replayIndex: 0 })
    const forecastChanges = snapshot.zones.map((zone) => zone.forecast30 - (zone.demand ?? 0))

    expect(snapshot.kpis.residualGap).toBeGreaterThan(40)
    expect(snapshot.kpis.residualGap).toBeLessThan(100)
    expect(snapshot.kpis.fulfillmentRate).toBeGreaterThan(80)
    expect(forecastChanges.some((change) => change < 0)).toBe(true)
    expect(forecastChanges.some((change) => change > 0)).toBe(true)
  })

  it('improves supply and residual gap for a simulated plan', () => {
    const zones = createZones()
    const baseline = simulateSnapshot(zones, { comparison: 'baseline', gain: 0, regime: 'rain_peak', replayIndex: 0 })
    const plan = simulateSnapshot(zones, { comparison: 'plan', gain: 0, regime: 'rain_peak', replayIndex: 0 })

    expect(plan.kpis.fleetAvailable).toBeGreaterThan(baseline.kpis.fleetAvailable)
    expect(plan.kpis.residualGap).toBeLessThan(baseline.kpis.residualGap)
  })
})
