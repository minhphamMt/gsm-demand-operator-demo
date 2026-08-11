import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { projectZonesAtMinute } from '@/features/operator-dashboard/model/forecastProjection'

const zone: Zone = {
  id: 'zone-1', h3Index: 'h3', label: 'Hoàn Kiếm', center: [105.85, 21.03], boundary: [],
  supply: 20, demand: 20, gap: 0, severity: 'Low', confidence: 0.92, forecast15: 30, forecast30: 40,
}

describe('projectZonesAtMinute', () => {
  it('preserves the current snapshot at minute zero', () => {
    expect(projectZonesAtMinute([zone], 0)[0]).toMatchObject({ demand: 20, gap: 0, severity: 'Low' })
  })

  it('interpolates across both forecast horizons stored by the DB contract', () => {
    const easingZone = { ...zone, id: 'zone-2', forecast15: 18, forecast30: 16 }
    const projected15 = projectZonesAtMinute([zone, easingZone], 15)
    const projected30 = projectZonesAtMinute([zone, easingZone], 30)

    expect(projected15.map((item) => item.demand)).toEqual([30, 18])
    expect(projected30.map((item) => item.demand)).toEqual([40, 16])
  })

  it('projects forecast supply instead of comparing future demand with stale current supply', () => {
    const projected = projectZonesAtMinute([{ ...zone, forecastSupply15: 26, forecastSupply30: 38 }], 15)[0]

    expect(projected).toMatchObject({ supply: 26, demand: 30, gap: 4, severity: 'Medium' })
  })

  it('clamps the forecast range and keeps source data immutable', () => {
    expect(projectZonesAtMinute([zone], 45)).toEqual(projectZonesAtMinute([zone], 30))
    expect(zone).toMatchObject({ demand: 20, gap: 0, severity: 'Low' })
  })
})
