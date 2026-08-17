import { describe, expect, it } from 'vitest'

import { availableForecastHorizons, forecastRunForHorizon, hasExactForecastRun, supportedForecastHorizons } from '@/features/operator-data/model/forecastRun'

const base = { zoneContract: 'AI_ZONE_1_30' as const, registeredZones: 30, liveZones: 30, forecastedZones: 30, horizons: [5, 15] as const, modelVersion: 'v1', forecastMode: 'trained', dataSource: 'db', forecastAt: '2026-08-14T00:00:00Z', forecastRunId: 'run-1' }

describe('hasExactForecastRun', () => {
  it('shows every server-supported horizon before each run has been generated', () => {
    expect(supportedForecastHorizons([30, 5, 15, 30], { ...base, horizons: [5] }))
      .toEqual([5, 15, 30])
  })

  it('uses only server-declared supported horizons and removes duplicates', () => {
    expect(availableForecastHorizons({ ...base, horizons: [30, 5, 30, 99] })).toEqual([30, 5])
  })

  it('uses the matching immutable run for each horizon and rejects a partial newer run', () => {
    const status = {
      ...base,
      forecastRuns: [
        { id: 'run-5', horizonMinutes: 5 as const, status: 'COMPLETED' as const, modelVersion: 'v5', featureVersion: 'f', policyVersion: 'p', inputHash: 'a', forecastMode: 'trained', dataSource: 'db', forecastAt: '2026-08-14T00:00:00Z', completedAt: '2026-08-14T00:00:01Z', zoneCount: 30 },
        { id: 'run-15', horizonMinutes: 15 as const, status: 'COMPLETED' as const, modelVersion: 'v15', featureVersion: 'f', policyVersion: 'p', inputHash: 'b', forecastMode: 'trained', dataSource: 'db', forecastAt: '2026-08-14T00:00:00Z', completedAt: '2026-08-14T00:00:02Z', zoneCount: 29 },
      ],
    }

    expect(availableForecastHorizons(status)).toEqual([5])
    expect(forecastRunForHorizon(status, 5)?.modelVersion).toBe('v5')
    expect(hasExactForecastRun(status, 15)).toBe(false)
  })

  it('requires one completed run with every registered zone for the requested horizon', () => {
    expect(hasExactForecastRun({ ...base, forecastStatus: 'COMPLETED' }, 5)).toBe(true)
    expect(hasExactForecastRun({ ...base, forecastStatus: 'RUNNING' }, 5)).toBe(false)
    expect(hasExactForecastRun({ ...base, forecastStatus: 'COMPLETED', forecastedZones: 29 }, 5)).toBe(false)
    expect(hasExactForecastRun({ ...base, forecastStatus: 'COMPLETED' }, 30)).toBe(false)
  })
})
