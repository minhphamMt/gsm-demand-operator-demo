import { describe, expect, it } from 'vitest'

import type { Move, Zone } from '@/features/operator-data'
import { createZones } from '@/features/operator-data/model/zoneGeometry'
import { buildFlowCollections, mapLayerThresholds, mapViewportForView, zoneFillColor, zonesForMapView } from './operatorMapGeometry'

describe('buildFlowCollections', () => {
  it('creates a curved route and vehicle label between model-selected zones', () => {
    const zones = [
      { id: 'AI-Z01', center: [105.8, 21] },
      { id: 'AI-Z02', center: [105.9, 21.1] },
    ] as Zone[]
    const moves = [{ id: 'm1', sourceZoneId: 'AI-Z01', targetZoneId: 'AI-Z02', quantity: 8 }] as Move[]
    const result = buildFlowCollections(zones, moves)
    expect(result.routes.features).toHaveLength(1)
    expect(result.routes.features[0]?.geometry.coordinates).toHaveLength(21)
    expect(result.labels.features[0]?.properties?.label).toBe('8 xe')
  })

  it('omits empty moves and fits core view to actual core zones', () => {
    const zones = [
      { id: 'AI-Z01', tier: 'core' },
      { id: 'AI-Z14', tier: 'outer' },
    ] as Zone[]
    const moves = [{ id: 'm1', sourceZoneId: 'AI-Z01', targetZoneId: 'AI-Z14', quantity: 0 }] as Move[]

    expect(buildFlowCollections(zones, moves).routes.features).toHaveLength(0)
    expect(zonesForMapView(zones, 'core').map((zone) => zone.id)).toEqual(['AI-Z01'])
  })

  it('uses geographic AI zone ids instead of risk tiers for the operational core', () => {
    const liveZones = [
      { id: 'AI-Z01', aiZoneId: 1, tier: 'medium' },
      { id: 'AI-Z02', aiZoneId: 2, tier: 'high' },
      { id: 'AI-Z14', aiZoneId: 14, tier: 'low' },
    ] as Zone[]
    expect(zonesForMapView(liveZones, 'core').map((zone) => zone.id)).toEqual(['AI-Z01', 'AI-Z02'])
    expect(zonesForMapView(liveZones, 'city')).toHaveLength(liveZones.length)
  })

  it('keeps the core view focused on the seven central districts, including Hoàn Kiếm and Ba Đình', () => {
    const coreZones = zonesForMapView(createZones(), 'core')

    expect(coreZones).toHaveLength(7)
    expect(coreZones.map((zone) => zone.label)).toEqual([
      'Ba Đình', 'Hoàn Kiếm', 'Hai Bà Trưng', 'Đống Đa', 'Tây Hồ', 'Cầu Giấy', 'Thanh Xuân',
    ])
    expect(coreZones.some((zone) => zone.label === 'Gia Lâm')).toBe(false)
  })

  it('uses a wide city viewport and a close central viewport', () => {
    const city = mapViewportForView('city')
    const core = mapViewportForView('core')

    expect(city.zoom).toBeLessThan(core.zoom)
    expect(city.center).toEqual([105.68, 20.98])
    expect(core.center).toEqual([105.834, 21.03])
  })

  it('uses per-zone bands that match the project dataset scale', () => {
    expect(mapLayerThresholds.supply).toEqual({ medium: 6, high: 13 })
    expect(mapLayerThresholds.demand).toEqual({ medium: 8, high: 16 })
    expect(JSON.stringify(zoneFillColor('supply'))).toContain('13')
    expect(JSON.stringify(zoneFillColor('demand'))).toContain('16')
    expect(JSON.stringify(zoneFillColor('gap'))).toContain('missing')
  })
})
