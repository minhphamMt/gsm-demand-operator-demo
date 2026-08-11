import { featureCollection, polygon } from '@turf/helpers'
import type { FeatureCollection, Polygon } from 'geojson'
import { cellToBoundary, cellToLatLng, gridDisk, gridRing, latLngToCell } from 'h3-js'

import type { Zone } from '@/features/operator-data/model/types'

const hanoiCenterCell = latLngToCell(21.0278, 105.8342, 8)
const zoneCells = [...gridDisk(hanoiCenterCell, 2), ...gridRing(hanoiCenterCell, 3).slice(0, 11)]

const districtProfiles = [
  { name: 'Cầu Giấy', supply: 20, demand: 17, forecast15: 19, forecast30: 21, confidence: 91 },
  { name: 'Ba Đình', supply: 18, demand: 19, forecast15: 22, forecast30: 18, confidence: 92 },
  { name: 'Đống Đa', supply: 20, demand: 18, forecast15: 20, forecast30: 22, confidence: 90 },
  { name: 'Hoàn Kiếm', supply: 14, demand: 24, forecast15: 28, forecast30: 22, confidence: 94 },
  { name: 'Hai Bà Trưng', supply: 17, demand: 22, forecast15: 25, forecast30: 20, confidence: 92 },
  { name: 'Long Biên', supply: 18, demand: 15, forecast15: 14, forecast30: 16, confidence: 89 },
  { name: 'Tây Hồ', supply: 18, demand: 13, forecast15: 15, forecast30: 17, confidence: 88 },
  { name: 'Nam Từ Liêm', supply: 19, demand: 16, forecast15: 18, forecast30: 20, confidence: 87 },
  { name: 'Thanh Xuân', supply: 19, demand: 15, forecast15: 17, forecast30: 19, confidence: 90 },
  { name: 'Hoàng Mai', supply: 18, demand: 19, forecast15: 22, forecast30: 21, confidence: 89 },
] as const
const cellAdjustments = [
  { supply: 0, demand: 0, forecast: 0, confidence: 0 },
  { supply: -2, demand: 2, forecast: 2, confidence: -2 },
  { supply: 1, demand: -1, forecast: -1, confidence: 1 },
] as const

export function createZones(): readonly Zone[] {
  return zoneCells.map((h3Index, index) => {
    const profile = districtProfiles[index % districtProfiles.length] ?? districtProfiles[0]
    const cellNumber = Math.floor(index / districtProfiles.length)
    const adjustment = cellAdjustments[cellNumber] ?? cellAdjustments[0]
    const [latitude, longitude] = cellToLatLng(h3Index)
    const boundary: [number, number][] = cellToBoundary(h3Index).map(([latitude, longitude]) => [longitude, latitude])
    const supply = profile.supply + adjustment.supply
    const demand = profile.demand + adjustment.demand
    const gap = demand - supply
    return {
      id: `zone-${String(index + 1).padStart(2, '0')}`,
      h3Index,
      label: `${profile.name} ${cellNumber + 1}`,
      center: [longitude, latitude],
      boundary,
      supply,
      demand,
      gap,
      severity: severityForGap(gap),
      confidence: profile.confidence + adjustment.confidence,
      forecast15: profile.forecast15 + adjustment.forecast,
      forecast30: profile.forecast30 + adjustment.forecast,
    }
  })
}

function severityForGap(gap: number): Zone['severity'] {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}

export function zonesToFeatureCollection(zones: readonly Zone[]): FeatureCollection<Polygon, Pick<Zone, 'id' | 'label' | 'gap' | 'severity' | 'supply' | 'demand' | 'dataStatus'>> {
  return featureCollection(zones.map((zone) => polygon([[...zone.boundary, zone.boundary[0] ?? zone.center]], {
    id: zone.id, label: zone.label, gap: zone.gap, severity: zone.severity, supply: zone.supply, demand: zone.demand, dataStatus: zone.dataStatus ?? 'live',
  })))
}
