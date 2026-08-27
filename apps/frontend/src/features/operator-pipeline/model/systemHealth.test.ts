import { describe, expect, it } from 'vitest'

import type { Snapshot, Zone } from '@/features/operator-data'
import { buildSystemHealth } from '@/features/operator-pipeline/model/systemHealth'

const zone = (id: string, demand: number | null, supply: number | null, forecast15 = demand ?? 0): Zone => ({
  id,
  aiZoneId: Number(id),
  zoneCode: `AI-Z${id}`,
  label: `Zone ${id}`,
  tier: 'core',
  areaKm2: 1,
  center: [105.8, 21],
  boundary: [],
  dataStatus: demand === null ? 'missing' : 'live',
  supply,
  demand,
  gap: demand === null || supply === null ? null : Math.max(0, demand - supply),
  severity: 'Low',
  confidence: 90,
  rainMmH: 0,
  rainForecast15: 0,
  rainForecast30: 0,
  forecast15,
  forecast30: forecast15,
  forecastSupply15: supply ?? 0,
})

const snapshot = (zones: readonly Zone[]): Snapshot => ({
  generatedAt: '2026-08-23T17:05:00+07:00',
  sourceAt: '2026-08-23T17:05:00+07:00',
  replayStep: '5',
  scenario: 'baseline',
  demoScenarioId: 'rain-peak',
  regime: 'rain_peak',
  zones,
  hotspots: [],
  kpis: { fleetAvailable: 30, requests: 40, fulfillmentRate: 75, residualGap: 10, avgWaitProxy: 6.2 },
})

describe('buildSystemHealth', () => {
  it('uses the backend KPI values verbatim at the current horizon', () => {
    const health = buildSystemHealth(snapshot([zone('1', 25, 15), zone('2', 15, 15)]), 0)

    expect(health.totalSupply).toBe(30)
    expect(health.activeDemand).toBe(40)
    expect(health.residualGap).toBe(10)
    expect(health.fulfillmentRatePct).toBe(75)
    expect(health.avgWaitProxy).toBeCloseTo(6.2)
  })

  it('leaves fulfilment and wait empty at forecast horizons instead of recomputing them', () => {
    const health = buildSystemHealth(snapshot([zone('1', 25, 15, 30)]), 15)

    expect(health.fulfillmentRatePct).toBeNull()
    expect(health.avgWaitProxy).toBeNull()
    expect(health.activeDemand).toBe(30)
  })

  it('ranks the breakdown by shortage and drops zones without an observation', () => {
    const health = buildSystemHealth(snapshot([zone('1', 10, 9), zone('2', 30, 10), zone('3', null, null)]), 0)

    expect(health.breakdown.map((row) => row.zoneId)).toEqual(['2', '1'])
    expect(health.breakdown[0]?.gap).toBe(20)
    expect(health.observedZoneCount).toBe(2)
  })

  it('caps demand pressure at 100 percent when demand outruns supply', () => {
    const health = buildSystemHealth(snapshot([zone('1', 90, 10)]), 15)

    expect(health.demandPressurePct).toBe(100)
  })
})
