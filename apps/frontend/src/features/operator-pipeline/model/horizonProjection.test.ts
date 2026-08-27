import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { isExtrapolated, projectZones } from '@/features/operator-pipeline/model/horizonProjection'

const zone = (demand: number, supply: number, forecast15: number, forecastSupply15: number): Zone => ({
  id: '1',
  aiZoneId: 1,
  zoneCode: 'AI-Z01',
  label: 'Zone 1',
  tier: 'core',
  areaKm2: 1,
  center: [105.8, 21],
  boundary: [],
  dataStatus: 'live',
  supply,
  demand,
  gap: Math.max(0, demand - supply),
  severity: 'Low',
  confidence: 90,
  rainMmH: 0,
  rainForecast15: 0,
  rainForecast30: 0,
  forecast15,
  forecast30: forecast15,
  forecastSupply15,
})

describe('projectZones', () => {
  it('returns the snapshot untouched at the current horizon', () => {
    const zones = [zone(20, 10, 26, 9)]
    expect(projectZones(zones, 0)).toBe(zones)
  })

  it('uses the model forecast at +15 minutes', () => {
    const [projected] = projectZones([zone(20, 10, 26, 9)], 15)

    expect(projected?.demand).toBe(26)
    expect(projected?.supply).toBe(9)
    expect(projected?.operationalGap).toBe(17)
  })

  it('extends the observed slope once more at +30 minutes', () => {
    const [projected] = projectZones([zone(20, 10, 26, 9)], 30)

    // cầu 20 → 26 (+6) nên +30 là 32; cung 10 → 9 (−1) nên +30 là 8.
    expect(projected?.demand).toBe(32)
    expect(projected?.supply).toBe(8)
  })

  it('never projects a negative quantity', () => {
    const [projected] = projectZones([zone(10, 10, 2, 3)], 30)

    expect(projected?.demand).toBe(0)
    expect(projected?.supply).toBe(0)
  })

  it('leaves zones without an observation alone', () => {
    const missing = { ...zone(0, 0, 0, 0), dataStatus: 'missing' as const, demand: null, supply: null, gap: null }
    const [projected] = projectZones([missing], 30)

    expect(projected?.demand).toBeNull()
  })

  it('marks only the 30 minute mark as extrapolated', () => {
    expect(isExtrapolated(30)).toBe(true)
    expect(isExtrapolated(15)).toBe(false)
  })
})
