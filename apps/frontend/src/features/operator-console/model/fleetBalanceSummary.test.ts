import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { fleetBalanceSummary } from '@/features/operator-console/model/fleetBalanceSummary'

const zone = (id: string, demand: number, supply: number, operationalGap?: number): Zone => ({
  id,
  aiZoneId: Number(id),
  zoneCode: `AI-Z${id}`,
  label: `Zone ${id}`,
  tier: 'core',
  areaKm2: 1,
  center: [105.8, 21],
  boundary: [],
  dataStatus: 'live',
  supply,
  demand,
  gap: Math.max(0, demand - supply),
  ...(operationalGap === undefined ? {} : { operationalGap }),
  severity: 'Low',
  confidence: 90,
  rainMmH: 0,
  rainForecast15: 0,
  rainForecast30: 0,
  forecast15: demand,
  forecast30: demand,
})

describe('fleetBalanceSummary', () => {
  it('separates the median shortage from the conservative risk buffer', () => {
    expect(fleetBalanceSummary([
      zone('1', 20, 15, 9),
      zone('2', 8, 14, -2),
    ])).toEqual({
      medianDeficit: 5,
      riskAdjustedDeficit: 9,
      riskBuffer: 4,
      forecastSurplus: 6,
      safeDispatchable: 2,
    })
  })

  it('falls back to the median gap when no risk-adjusted gap is supplied', () => {
    expect(fleetBalanceSummary([zone('1', 10, 7), zone('2', 4, 9)])).toEqual({
      medianDeficit: 3,
      riskAdjustedDeficit: 3,
      riskBuffer: 0,
      forecastSurplus: 5,
      safeDispatchable: 5,
    })
  })

  it('excludes zones without a valid observation', () => {
    const missing = { ...zone('3', 10, 0), dataStatus: 'missing' as const, demand: null, supply: null, gap: null }
    expect(fleetBalanceSummary([missing])).toEqual({
      medianDeficit: 0,
      riskAdjustedDeficit: 0,
      riskBuffer: 0,
      forecastSurplus: 0,
      safeDispatchable: 0,
    })
  })
})
