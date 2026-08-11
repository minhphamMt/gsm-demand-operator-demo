import { describe, expect, it } from 'vitest'

import { createZones, zonesToFeatureCollection } from '@/features/operator-data/model/zoneGeometry'

describe('canonical AI zones', () => {
  it('creates exactly the 30 AI registry zones with closed polygons', () => {
    const zones = createZones()
    const geometry = zonesToFeatureCollection(zones)
    expect(zones).toHaveLength(30)
    expect(zones.map((zone) => zone.aiZoneId)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1))
    expect(zones.map((zone) => zone.zoneCode)).toEqual(Array.from({ length: 30 }, (_, index) => `AI-Z${String(index + 1).padStart(2, '0')}`))
    expect(geometry.features).toHaveLength(30)
    expect(geometry.features[0]?.geometry.coordinates[0]?.at(0)).toEqual(geometry.features[0]?.geometry.coordinates[0]?.at(-1))
  })
})
