import { describe, expect, it } from 'vitest'

import type { Move, Zone } from '@/features/operator-data'
import { buildFlowCollections, mapLayerThresholds, zoneFillColor, zonesForMapView } from './operatorMapGeometry'

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

  it('uses per-zone bands that match the project dataset scale', () => {
    expect(mapLayerThresholds.supply).toEqual({ medium: 6, high: 13 })
    expect(mapLayerThresholds.demand).toEqual({ medium: 8, high: 16 })
    expect(JSON.stringify(zoneFillColor('supply'))).toContain('13')
    expect(JSON.stringify(zoneFillColor('demand'))).toContain('16')
    expect(JSON.stringify(zoneFillColor('gap'))).toContain('missing')
  })
})
