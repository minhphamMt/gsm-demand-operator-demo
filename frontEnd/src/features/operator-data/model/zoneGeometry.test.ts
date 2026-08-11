import { describe, expect, it } from 'vitest'
import { areNeighborCells } from 'h3-js'

import { createZones, zonesToFeatureCollection } from '@/features/operator-data/model/zoneGeometry'

describe('operator H3 zones', () => {
  it('creates 30 deterministic H3 cells with closed GeoJSON polygons', () => {
    const zones = createZones()
    const geometry = zonesToFeatureCollection(zones)
    expect(zones).toHaveLength(30)
    expect(new Set(zones.map((zone) => zone.h3Index)).size).toBe(30)
    expect(geometry.features).toHaveLength(30)
    expect(geometry.features[0]?.geometry.coordinates[0]?.at(0)).toEqual(geometry.features[0]?.geometry.coordinates[0]?.at(-1))
  })

  it('creates one connected cluster of adjacent H3 cells', () => {
    const indexes = createZones().map((zone) => zone.h3Index)
    const visited = new Set<string>([indexes[0] ?? ''])

    while (true) {
      const next = indexes.find((candidate) => !visited.has(candidate) && [...visited].some((cell) => areNeighborCells(cell, candidate)))
      if (!next) break
      visited.add(next)
    }

    expect(visited.size).toBe(indexes.length)
  })
})
