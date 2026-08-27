import { featureCollection, lineString, point } from '@turf/helpers'
import type { ExpressionSpecification } from 'mapbox-gl'

import type { Move, Zone } from '@/features/operator-data'

export type FlowState = 'proposal' | 'executing' | 'completed'

export const mapTheme = {
  balanced: '#dde5e3',
  balancedStroke: '#aab7b4',
  deficitHigh: '#e0503c',
  deficitHighStroke: '#82271c',
  deficitLow: '#f4ada0',
  deficitLowStroke: '#a83426',
  flow: '#14837f',
  flowComplete: '#2f9e5c',
  ink: '#14302e',
  surplus: '#2bb8ad',
  surplusStroke: '#0c6e69',
} as const

export const mapLayerThresholds = {
  demand: { medium: 8, high: 16 },
  supply: { medium: 6, high: 13 },
} as const

export function mapLegendFor(layer: 'gap' | 'demand' | 'supply', forecastMinutes: number) {
  const isForecast = forecastMinutes > 0
  return (
    layer === 'demand'
      ? {
          title: isForecast ? 'CHÚ GIẢI NHU CẦU DỰ BÁO P50' : 'CHÚ GIẢI NHU CẦU GHI NHẬN',
          items: [
            ['#f9ded8', `Thấp < ${mapLayerThresholds.demand.medium} xe`],
            ['#f4ada0', `Vừa ${mapLayerThresholds.demand.medium}–${mapLayerThresholds.demand.high - 1} xe`],
            ['#e0503c', `Cao ≥ ${mapLayerThresholds.demand.high} xe`],
          ],
        }
      : layer === 'supply'
        ? {
            title: isForecast ? 'CHÚ GIẢI CUNG DỰ BÁO P50' : 'CHÚ GIẢI CUNG GHI NHẬN',
            items: [
              ['#d9f4f1', `Ít < ${mapLayerThresholds.supply.medium} xe`],
              ['#72d8d1', `Vừa ${mapLayerThresholds.supply.medium}–${mapLayerThresholds.supply.high - 1} xe`],
              ['#0c6e69', `Nhiều ≥ ${mapLayerThresholds.supply.high} xe`],
            ],
          }
        : {
            title: isForecast ? 'CHÚ GIẢI RỦI RO DỰ BÁO P90' : 'CHÚ GIẢI CHÊNH LỆCH GHI NHẬN',
            items: [
              [mapTheme.deficitHigh, `${isForecast ? 'Thiếu p90' : 'Thiếu'} ≥ 8 xe`],
              [mapTheme.deficitLow, `${isForecast ? 'Thiếu p90' : 'Thiếu'} 3–7 xe`],
              [mapTheme.surplus, 'Dư ≥ 4 xe'],
              [mapTheme.balanced, 'Cân bằng −3…+2'],
            ],
          }
  )
}

export function zoneFillColor(layer: 'gap' | 'demand' | 'supply'): ExpressionSpecification {
  if (layer === 'demand') return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#cbd5e1', ['step', ['get', 'demand'], '#f9ded8', mapLayerThresholds.demand.medium, '#f4ada0', mapLayerThresholds.demand.high, '#e0503c']]
  if (layer === 'supply') return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#cbd5e1', ['step', ['get', 'supply'], '#d9f4f1', mapLayerThresholds.supply.medium, '#72d8d1', mapLayerThresholds.supply.high, '#0c6e69']]
  return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#cbd5e1', ['>=', ['get', 'operationalGap'], 8], mapTheme.deficitHigh, ['>=', ['get', 'operationalGap'], 3], mapTheme.deficitLow, ['<=', ['get', 'operationalGap'], -4], mapTheme.surplus, mapTheme.balanced]
}

export function zoneStrokeColor(layer: 'gap' | 'demand' | 'supply'): ExpressionSpecification {
  if (layer === 'demand') return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#64748b', ['literal', mapTheme.deficitHighStroke]]
  if (layer === 'supply') return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#64748b', ['literal', mapTheme.surplusStroke]]
  return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#64748b', ['>=', ['get', 'operationalGap'], 8], mapTheme.deficitHighStroke, ['>=', ['get', 'operationalGap'], 3], mapTheme.deficitLowStroke, ['<=', ['get', 'operationalGap'], -4], mapTheme.surplusStroke, mapTheme.balancedStroke]
}

export function zoneDotRadius(layer: 'gap' | 'demand' | 'supply'): ExpressionSpecification {
  const property = layer === 'supply' ? 'supply' : 'demand'
  return ['case', ['==', ['get', 'dataStatus'], 'missing'], 9, ['interpolate', ['linear'], ['get', property], 0, 8, 5, 12.5, 15, 16, 30, 19, 60, 24, 100, 28.5]]
}

export type FlowFeatureProperties = {
  id: string
  kind: 'route' | 'arrowhead'
  quantity: number
  sourceLabel: string
  targetLabel: string
  width: number
}

export function buildFlowCollections(zones: readonly Zone[], moves: readonly Move[]) {
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]))
  const arcs = moves.filter((move) => move.quantity > 0).flatMap((move) => {
    const source = zonesById.get(move.sourceZoneId)
    const target = zonesById.get(move.targetZoneId)
    if (!source || !target) return []
    const coordinates = flowCurve(source.center, target.center)
    const properties: FlowFeatureProperties = {
      id: move.id,
      kind: 'route',
      quantity: move.quantity,
      sourceLabel: source.label || move.sourceZoneLabel || move.sourceZoneId,
      targetLabel: target.label || move.targetZoneLabel || move.targetZoneId,
      width: 1.5 + Math.min(4, move.quantity * 0.4),
    }
    return [lineString(coordinates, properties)]
  })
  const labels = arcs.map((arc) => {
    const coordinate = coordinateAt(arc.geometry.coordinates, Math.round((arc.geometry.coordinates.length - 1) * labelProgress))
    // Nhãn phải nói rõ chiều điều phối, không chỉ số xe: điều phối viên đọc "đi từ đâu về đâu" trước khi duyệt.
    return point(coordinate, {
      id: arc.properties.id,
      label: `${arc.properties.sourceLabel} → ${arc.properties.targetLabel}\n${arc.properties.quantity} xe`,
    })
  })
  // Mũi tên là hình học chứ không phải ký tự font: Mapbox không bao giờ ẩn nó vì va chạm nhãn.
  const arrowheads = arcs.map((arc) => lineString(arrowheadCoordinates(arc.geometry.coordinates), {
    ...arc.properties,
    id: `${arc.properties.id}-arrowhead`,
    kind: 'arrowhead' as const,
  }))
  return { labels: featureCollection(labels), routes: featureCollection([...arcs, ...arrowheads]) }
}

const coreMapZoneIdMax = 7

function isCoreMapZone(zone: Zone) {
  // The map view is geographic, so do not use a live risk tier such as
  // `high` to decide which districts belong to the city core. The AI zone
  // contract keeps the first seven zones as the central Hanoi operating area.
  if (Number.isFinite(zone.aiZoneId)) return zone.aiZoneId >= 1 && zone.aiZoneId <= coreMapZoneIdMax

  const code = zone.zoneCode || zone.id
  const match = /^AI-Z0*(\d+)$/.exec(code)
  if (match) return Number(match[1]) <= coreMapZoneIdMax

  return zone.tier === 'core'
}

export function zonesForMapView(zones: readonly Zone[], view: 'city' | 'core') {
  if (view === 'city') return zones
  const coreZones = zones.filter(isCoreMapZone)
  return coreZones.length ? coreZones : zones
}

export type OperatorMapViewport = {
  center: [longitude: number, latitude: number]
  zoom: number
}

/** Keep the two map modes visibly distinct across data refreshes. */
export function mapViewportForView(view: 'city' | 'core'): OperatorMapViewport {
  return view === 'core'
    ? { center: [105.834, 21.03], zoom: 12.25 }
    : { center: [105.68, 20.98], zoom: 9.35 }
}

// Nhiều cung thường chụm về cùng một zone đích, nên nhãn nằm gần đầu nguồn (nơi các cung còn tách nhau)
// và mũi tên nằm giữa cung. Hướng mũi tên do góc xoay quyết định, không cần dán sát đích.
const labelProgress = 0.32
const arrowheadProgress = 0.62
const arrowheadSpreadRad = (30 * Math.PI) / 180
const arrowheadLengthRatio = 0.12
const arrowheadMinDeg = 0.0028
const arrowheadMaxDeg = 0.0065

function coordinateAt(curve: readonly number[][], index: number): [number, number] {
  const position = curve[index] ?? []
  return [position[0] ?? 0, position[1] ?? 0]
}

function arrowheadCoordinates(curve: readonly number[][]): [number, number][] {
  const lastIndex = curve.length - 1
  const tipIndex = Math.max(1, Math.round(lastIndex * arrowheadProgress))
  const [tipLng, tipLat] = coordinateAt(curve, tipIndex)
  const [backLng, backLat] = coordinateAt(curve, tipIndex - 1)
  const [startLng, startLat] = coordinateAt(curve, 0)
  const [endLng, endLat] = coordinateAt(curve, lastIndex)
  // Quy kinh độ về mặt phẳng cục bộ trước khi xoay, nếu không góc mũi tên bị méo theo vĩ độ.
  const scale = Math.cos((tipLat * Math.PI) / 180) || 1
  const heading = Math.atan2(tipLat - backLat, (tipLng - backLng) * scale)
  const chord = Math.hypot((endLng - startLng) * scale, endLat - startLat)
  const size = Math.min(arrowheadMaxDeg, Math.max(arrowheadMinDeg, chord * arrowheadLengthRatio))
  const barb = (offset: number): [number, number] => {
    const angle = heading + Math.PI + offset
    return [tipLng + (Math.cos(angle) * size) / scale, tipLat + Math.sin(angle) * size]
  }
  return [barb(arrowheadSpreadRad), [tipLng, tipLat], barb(-arrowheadSpreadRad)]
}

function flowCurve(source: Zone['center'], target: Zone['center']): [number, number][] {
  const [sourceLng, sourceLat] = source
  const [targetLng, targetLat] = target
  const middleLat = (sourceLat + targetLat) / 2 + (targetLng - sourceLng) * 0.12
  const middleLng = (sourceLng + targetLng) / 2 - (targetLat - sourceLat) * 0.12
  return Array.from({ length: 21 }, (_, index) => {
    const progress = index / 20
    const inverse = 1 - progress
    return [
      inverse ** 2 * sourceLng + 2 * inverse * progress * middleLng + progress ** 2 * targetLng,
      inverse ** 2 * sourceLat + 2 * inverse * progress * middleLat + progress ** 2 * targetLat,
    ]
  })
}
