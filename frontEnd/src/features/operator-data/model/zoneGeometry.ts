import { featureCollection, point, polygon } from '@turf/helpers'
import type { FeatureCollection, Point, Polygon } from 'geojson'

import { AI_ZONE_CATALOG } from '@/features/operator-data/model/aiZoneCatalog'
import type { Zone } from '@/features/operator-data/model/types'
import { operationalGapFor } from '@/features/operator-data/model/zoneBalance'

export function createZones(): readonly Zone[] {
  return AI_ZONE_CATALOG.map(([zoneId, label, latitude, longitude, radiusM]) => {
    const supply = 12 + (zoneId * 7) % 17
    const demand = 11 + (zoneId * 11) % 20
    const forecast15 = Math.max(0, demand + (zoneId % 3 - 1) * 2)
    const forecast30 = Math.max(0, forecast15 + (zoneId % 4 - 2))
    const gap = Math.max(0, demand - supply)
    return {
      id: `AI-Z${String(zoneId).padStart(2, '0')}`,
      aiZoneId: zoneId,
      zoneCode: `AI-Z${String(zoneId).padStart(2, '0')}`,
      label,
      tier: zoneId <= 7 ? 'core' : zoneId <= 13 ? 'ring' : 'outer',
      areaKm2: Math.PI * radiusM ** 2 / 1_000_000,
      center: [longitude, latitude],
      boundary: circleBoundary(longitude, latitude, radiusM),
      dataStatus: 'live',
      supply,
      demand,
      gap,
      severity: severityForGap(gap),
      confidence: null,
      rainMmH: 0,
      rainForecast15: 0,
      rainForecast30: 0,
      forecast15,
      forecast30,
      forecastSupply15: supply,
      forecastSupply30: supply,
    }
  })
}

function circleBoundary(longitude: number, latitude: number, radiusM: number): [number, number][] {
  const latitudeScale = radiusM / 111_320
  const longitudeScale = latitudeScale / Math.cos(latitude * Math.PI / 180)
  return Array.from({ length: 33 }, (_, index) => {
    const angle = index / 32 * Math.PI * 2
    return [longitude + Math.cos(angle) * longitudeScale, latitude + Math.sin(angle) * latitudeScale]
  })
}

function severityForGap(gap: number): Zone['severity'] {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}

type ZoneMapProperties = Pick<Zone, 'id' | 'label' | 'gap' | 'severity' | 'supply' | 'demand' | 'dataStatus' | 'areaKm2' | 'rainMmH'> & { operationalGap: number }

const mapProperties = (zone: Zone): ZoneMapProperties => ({
  id: zone.id, label: zone.label, gap: zone.gap, severity: zone.severity, supply: zone.supply,
  demand: zone.demand, dataStatus: zone.dataStatus ?? 'live', areaKm2: zone.areaKm2, rainMmH: zone.rainMmH,
  operationalGap: zone.operationalGap ?? operationalGapFor(zone),
})

export function zonesToFeatureCollection(zones: readonly Zone[]): FeatureCollection<Polygon, ZoneMapProperties> {
  return featureCollection(zones.map((zone) => polygon([[...zone.boundary, zone.boundary[0] ?? zone.center]], {
    ...mapProperties(zone),
  })))
}

export function zoneCentersToFeatureCollection(zones: readonly Zone[]): FeatureCollection<Point, ZoneMapProperties> {
  return featureCollection(zones.map((zone) => point(zone.center, mapProperties(zone))))
}
