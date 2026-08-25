import { featureCollection, lineString, polygon, point } from '@turf/helpers'
import type { FeatureCollection, Point, Polygon } from 'geojson'

import { createZones, zoneCentersToFeatureCollection, zonesToFeatureCollection } from '@/features/operator-data/model/zoneGeometry'
import type { Move, Zone } from '@/features/operator-data/model/types'

import { dispatchPlans, operationsZones, zoneById } from './mockData'
import type { ForecastHorizon, FlowStage, OperationsZone } from '../types'
import { zoneStatusLabels } from '../uiLabels'

const baseMapZones = createZones()
const operationsByName = new Map(operationsZones.map((zone) => [zone.name, zone]))

const forecastDemandFactor: Record<ForecastHorizon, number> = { 0: 1, 10: 1.06, 20: 1.14, 30: 1.2 }
const forecastSupplyFactor: Record<ForecastHorizon, number> = { 0: 1, 10: 0.99, 20: 0.96, 30: 0.93 }

export type OperationsMapProperties = {
  id: string
  label: string
  status: OperationsZone['status']
  statusLabel: string
  risk: number
  operationalGap: number
  dataStatus: 'live' | 'missing'
  demand: number
  supply: number
  gap: number
}

type HorizonMapZone = Zone & { operationsStatus?: OperationsZone['status']; operationsRisk?: number }

export type VehicleMapProperties = { id: string; status: 'NORMAL' | 'MOVING' | 'SHORTAGE'; heading: number }
export type PassengerMapProperties = { id: string; intensity: 'HIGH' | 'MEDIUM'; load: number }

export function mapZonesAtHorizon(horizon: ForecastHorizon): readonly HorizonMapZone[] {
  return baseMapZones.map((zone) => {
    const operationsZone = operationsByName.get(zone.label)
    if (!operationsZone) return zone
    const demand = Math.round(operationsZone.demand * forecastDemandFactor[horizon])
    const supply = Math.round(operationsZone.supply * forecastSupplyFactor[horizon])
    const gap = demand - supply
    const risk = Math.min(98, Math.round(operationsZone.risk + (horizon / 30) * 8))
    const operationsStatus = operationsZone.status === 'SHORTAGE'
      ? 'SHORTAGE'
      : risk >= 72
        ? 'ABNORMAL'
        : risk >= 44
          ? 'WATCH'
          : 'BALANCED'
    return {
      ...zone,
      demand,
      supply,
      gap,
      operationalGap: gap,
      forecast15: Math.round(operationsZone.demand * forecastDemandFactor[10]),
      forecast30: Math.round(operationsZone.demand * forecastDemandFactor[30]),
      forecastSupply15: Math.round(operationsZone.supply * forecastSupplyFactor[10]),
      forecastSupply30: Math.round(operationsZone.supply * forecastSupplyFactor[30]),
      severity: severityForGap(gap),
      rainMmH: operationsZone.status === 'WATCH' || operationsZone.status === 'SHORTAGE' ? 0.72 : 0.12,
      operationsStatus,
      operationsRisk: risk,
    }
  })
}

export function operationsZoneAreas(zones: readonly HorizonMapZone[]): FeatureCollection<Polygon, OperationsMapProperties> {
  const base = zonesToFeatureCollection(zones)
  return featureCollection(base.features.map((feature) => {
    const id = String(feature.properties?.id ?? '')
    const zone = zones.find((candidate) => candidate.id === id) ?? zones[0]!
    const operationsZone = operationsByName.get(zone.label)
    return {
      ...feature,
      id,
      properties: propertiesForZone(zone, operationsZone),
    }
  }))
}

export function operationsZoneCenters(zones: readonly HorizonMapZone[]): FeatureCollection<Point, OperationsMapProperties> {
  const base = zoneCentersToFeatureCollection(zones)
  return featureCollection(base.features.map((feature) => {
    const id = String(feature.properties?.id ?? '')
    const zone = zones.find((candidate) => candidate.id === id) ?? zones[0]!
    const operationsZone = operationsByName.get(zone.label)
    return {
      ...feature,
      id,
      properties: propertiesForZone(zone, operationsZone),
    }
  }))
}

export function operationsFlowCollections(zones: readonly Zone[]) {
  const moves = dispatchPlans[1]!.actions.flatMap((action) => {
    const source = zones.find((zone) => zone.label === zoneById[action.sourceZoneId]?.name)
    const target = zones.find((zone) => zone.label === zoneById[action.targetZoneId]?.name)
    if (!source || !target) return []
    const baselineTarget = operationsByName.get(target.label)
    const baselineGap = Math.max(1, (baselineTarget?.demand ?? 0) - (baselineTarget?.supply ?? 0))
    const currentGap = Math.max(0, target.gap ?? 0)
    const forecastPressure = Math.max(0, Math.min(0.6, (currentGap - baselineGap) / baselineGap))
    const quantity = Math.max(action.quantity, Math.round(action.quantity * (1 + forecastPressure * 0.65)))
    return [{
      id: action.id,
      sourceZoneId: source.id,
      sourceZoneLabel: source.label,
      targetZoneId: target.id,
      targetZoneLabel: target.label,
      quantity,
      distanceKm: 4.2,
      etaMinutes: 8,
      estimatedCost: 0,
      sourceSupplyAfter: Math.max(0, (source.supply ?? 0) - quantity),
    } satisfies Move]
  })
  const routes = moves.filter((move) => move.quantity > 0).flatMap((move) => {
    const source = zones.find((zone) => zone.id === move.sourceZoneId)
    const target = zones.find((zone) => zone.id === move.targetZoneId)
    if (!source || !target) return []
    return [lineString(roadRouteForMove(move.id, source.center, target.center), {
      id: move.id,
      quantity: move.quantity,
      width: 1.5 + Math.min(4, move.quantity * 0.4),
    })]
  })
  const labels = routes.map((route) => {
    const coordinate = route.geometry.coordinates[Math.floor(route.geometry.coordinates.length * 0.55)]!
    return point(coordinate, { id: route.properties.id, label: `${route.properties.quantity} xe` })
  })
  return { labels: featureCollection(labels), routes: featureCollection(routes) }
}

const vehicleSeed = [
  { id: 'EV-104', zoneId: 'zone-a', status: 'NORMAL' as const, routeId: 'b-1', offset: 0.04 },
  { id: 'EV-217', zoneId: 'zone-b', status: 'NORMAL' as const, routeId: 'b-2', offset: 0.16 },
  { id: 'EV-308', zoneId: 'zone-c', status: 'SHORTAGE' as const, routeId: null, offset: 0 },
  { id: 'EV-412', zoneId: 'zone-d', status: 'MOVING' as const, routeId: 'b-1', offset: 0.34 },
  { id: 'EV-526', zoneId: 'zone-e', status: 'NORMAL' as const, routeId: 'b-2', offset: 0.52 },
  { id: 'EV-633', zoneId: 'zone-f', status: 'MOVING' as const, routeId: 'b-3', offset: 0.24 },
  { id: 'EV-745', zoneId: 'zone-g', status: 'SHORTAGE' as const, routeId: null, offset: 0 },
  { id: 'EV-812', zoneId: 'zone-h', status: 'NORMAL' as const, routeId: 'b-3', offset: 0.68 },
  { id: 'EV-927', zoneId: 'zone-a', status: 'MOVING' as const, routeId: 'b-1', offset: 0.78 },
] as const

export function operationsVehicles(zones: readonly Zone[], flowStage: FlowStage, motionTick = 0, horizon: ForecastHorizon = 0): FeatureCollection<Point, VehicleMapProperties> {
  const routes = operationsFlowRoutes(zones)
  const executionRouteIds = ['b-1', 'b-2', 'b-3']
  return featureCollection(vehicleSeed.flatMap((vehicle) => {
    const operationsZone = zoneById[vehicle.zoneId]
    const zone = zones.find((candidate) => candidate.label === operationsZone?.name)
    if (!zone) return []
    const inExecution = flowStage === 'EXECUTING' || flowStage === 'DISPATCHING' || flowStage === 'NEW_DATA' || flowStage === 'REPLAN_READY' || flowStage === 'UPDATE_APPROVED'
    const forecastRepositioning = horizon > 0 && vehicle.status === 'NORMAL'
    const status = (inExecution || forecastRepositioning) && vehicle.status === 'NORMAL' ? 'MOVING' : vehicle.status
    const routeId = vehicle.routeId ?? (status === 'MOVING' ? executionRouteIds[vehicleSeed.indexOf(vehicle) % executionRouteIds.length] : null)
    const route = routeId ? routes.find((candidate) => candidate.id === routeId) : undefined
    if (route && status === 'MOVING') {
      const progress = (vehicle.offset + (horizon / 30) * 0.18 + motionTick * 0.022) % 1
      const position = pointAlongRoute(route.coordinates, progress)
      const ahead = pointAlongRoute(route.coordinates, Math.min(1, progress + 0.018))
      const heading = bearing(position, ahead)
      return [point(position, { id: vehicle.id, status, heading })]
    }
    const heading = vehicle.routeId ? bearing(zone.center, route?.coordinates.at(-1) ?? zone.center) : 0
    return [point(zone.center, { id: vehicle.id, status, heading })]
  }))
}

function operationsFlowRoutes(zones: readonly Zone[]) {
  return dispatchPlans[1]!.actions.flatMap((action) => {
    const source = zones.find((zone) => zone.label === zoneById[action.sourceZoneId]?.name)
    const target = zones.find((zone) => zone.label === zoneById[action.targetZoneId]?.name)
    if (!source || !target) return []
    return [{ id: action.id, coordinates: roadRouteForMove(action.id, source.center, target.center) }]
  })
}

const roadWaypoints: Record<string, [number, number][]> = {
  'b-1': [[105.8542, 21.0285], [105.8552, 21.0248], [105.8548, 21.0206], [105.8551, 21.0162], [105.855, 21.011]],
  'b-2': [[105.82, 21.068], [105.818, 21.056], [105.813, 21.045], [105.817, 21.034], [105.822, 21.024], [105.827, 21.015]],
  'b-3': [[105.79, 21.036], [105.801, 21.035], [105.813, 21.032], [105.825, 21.026], [105.839, 21.019], [105.855, 21.011]],
}

function roadRouteForMove(id: string, source: [number, number], target: [number, number]) {
  return roadWaypoints[id] ?? [source, target]
}

function pointAlongRoute(coordinates: readonly [number, number][], progress: number): [number, number] {
  const lengths = coordinates.slice(1).map((coordinate, index) => distance(coordinates[index]!, coordinate))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  let remaining = total * Math.max(0, Math.min(1, progress))
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index]!
    if (remaining <= segmentLength) {
      const start = coordinates[index]!
      const end = coordinates[index + 1]!
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]
    }
    remaining -= segmentLength
  }
  return coordinates.at(-1) ?? [0, 0]
}

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function bearing(from: [number, number], to: [number, number]) {
  return (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI + 360) % 360
}

export function operationsPassengers(zones: readonly Zone[], horizon: ForecastHorizon = 0): FeatureCollection<Point, PassengerMapProperties> {
  return featureCollection(['zone-d', 'zone-c'].flatMap((zoneId, index) => {
    const zone = zones.find((candidate) => candidate.label === zoneById[zoneId]?.name)
    if (!zone) return []
    const load = Math.round((zone.demand ?? 0) * (index === 0 ? 0.65 : 0.58) * (1 + horizon / 60))
    return [point([zone.center[0] + 0.002 + index * 0.001, zone.center[1] - 0.002], { id: `passenger-${zoneId}`, intensity: load >= 220 ? 'HIGH' : 'MEDIUM', load })]
  }))
}

export function forecastBoundary(zones: readonly Zone[]): FeatureCollection<Polygon> {
  const longitudes = zones.map((zone) => zone.center[0])
  const latitudes = zones.map((zone) => zone.center[1])
  const minLng = Math.min(...longitudes) - 0.04
  const maxLng = Math.max(...longitudes) + 0.04
  const minLat = Math.min(...latitudes) - 0.035
  const maxLat = Math.max(...latitudes) + 0.035
  return featureCollection([polygon([[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]])])
}

function propertiesForZone(zone: HorizonMapZone, operationsZone: OperationsZone | undefined): OperationsMapProperties {
  const operationalGap = zone.operationalGap ?? zone.gap ?? 0
  const status = zone.operationsStatus ?? operationsZone?.status ?? statusForGap(operationalGap)
  return {
    id: zone.id,
    label: zone.label,
    status,
    statusLabel: zoneStatusLabels[status],
    risk: zone.operationsRisk ?? operationsZone?.risk ?? Math.max(12, Math.min(76, operationalGap * 4 + 12)),
    operationalGap,
    dataStatus: zone.dataStatus ?? 'live',
    demand: zone.demand ?? 0,
    supply: zone.supply ?? 0,
    gap: zone.gap ?? 0,
  }
}

function statusForGap(gap: number): OperationsZone['status'] {
  if (gap >= 18) return 'SHORTAGE'
  if (gap >= 10) return 'ABNORMAL'
  if (gap >= 3) return 'WATCH'
  return 'BALANCED'
}

function severityForGap(gap: number) {
  if (gap >= 18) return 'Critical'
  if (gap >= 10) return 'High'
  if (gap >= 3) return 'Medium'
  return 'Low'
}
