import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { forecastSteps, meanRainAtMinute, projectZonesAtMinute } from '@/features/operator-dashboard/model/forecastProjection'

const zone: Zone = {
  id: 'AI-Z02', aiZoneId: 2, zoneCode: 'AI-Z02', label: 'Hoàn Kiếm', center: [105.85, 21.03], boundary: [], dataStatus: 'live',
  tier: 'core', areaKm2: 5.29, rainMmH: 0.3, rainForecast15: 0.9, rainForecast30: 0.6,
  supply: 20, demand: 20, gap: 0, severity: 'Low', confidence: 0.92, forecast10: 26, forecast15: 30, forecast30: 30,
}

describe('projectZonesAtMinute', () => {
  it('preserves the current snapshot at minute zero', () => {
    expect(projectZonesAtMinute([zone], 0)[0]).toMatchObject({ demand: 20, gap: 0, severity: 'Low' })
  })

  it('uses all three forecast horizons stored by the DB contract', () => {
    const easingZone = { ...zone, id: 'AI-Z03', aiZoneId: 3, zoneCode: 'AI-Z03', forecast10: 22, forecast15: 18 }
    const projected10 = projectZonesAtMinute([zone, easingZone], 10)
    const projected15 = projectZonesAtMinute([zone, easingZone], 15)
    expect(projected10.map((item) => item.demand)).toEqual([26, 22])
    expect(projected15.map((item) => item.demand)).toEqual([30, 18])
  })

  it('projects forecast supply instead of comparing future demand with stale current supply', () => {
    const projected = projectZonesAtMinute([{ ...zone, forecastSupply15: 26, forecastSupply30: 38 }], 15)[0]
    expect(projected).toMatchObject({ supply: 26, demand: 30, gap: 4, severity: 'Medium' })
  })

  it('uses the demand p90 bound for operational gap in conservative rain-peak mode', () => {
    const projected = projectZonesAtMinute([{
      ...zone,
      forecastSupply15: 26,
      demandRange15: [24, 42],
    }], 15, true)[0]
    expect(projected).toMatchObject({ demand: 30, supply: 26, operationalGap: 16, gap: 16 })
  })

  it('keeps a missing observation unknown at every forecast horizon', () => {
    const missing = { ...zone, dataStatus: 'missing' as const, supply: null, demand: null, gap: null, severity: 'Unknown' }
    expect(projectZonesAtMinute([missing], 15)[0]).toMatchObject({ dataStatus: 'missing', supply: null, demand: null, gap: null, severity: 'Unknown' })
  })

  it('uses the persisted five-minute quantiles and confidence for replay', () => {
    const projected = projectZonesAtMinute([{
      ...zone,
      confidence5: 87,
      demandRange5: [20, 33],
      forecast5: 26,
      forecastSupply5: 24,
    }], 5, true)[0]
    expect(projected).toMatchObject({ confidence: 87, demand: 26, supply: 24, operationalGap: 9, gap: 9 })
  })

  it('interpolates rain on every five-minute replay step', () => {
    expect(projectZonesAtMinute([zone], 5)[0]?.rainMmH).toBe(0.5)
    expect(projectZonesAtMinute([zone], 15)[0]?.rainMmH).toBe(0.9)
  })

  it('builds one selectable tick for every five minutes in the real model horizon', () => {
    expect(forecastSteps(15)).toEqual([0, 5, 10, 15])
    expect(forecastSteps(10)).toEqual([0, 5, 10])
    expect(meanRainAtMinute([zone], 10)).toBe(0.7)
  })

  it('clamps the forecast range and keeps source data immutable', () => {
    expect(projectZonesAtMinute([zone], 45)).toEqual(projectZonesAtMinute([zone], 15))
    expect(zone).toMatchObject({ demand: 20, gap: 0, severity: 'Low' })
  })
})
