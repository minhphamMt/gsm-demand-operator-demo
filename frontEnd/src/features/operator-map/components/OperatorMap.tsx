import * as mapboxgl from 'mapbox-gl/esm'
import { LocateFixed } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'

import { zonesToFeatureCollection } from '@/features/operator-data'
import type { Zone } from '@/features/operator-data'
import { env } from '@/shared/config/env'

const hanoiCenter: [longitude: number, latitude: number] = [105.8342, 21.0278]
type MapStatus = 'idle' | 'ready' | 'error'
export type OperatorMapLayer = 'gap' | 'demand' | 'supply'
export type OperatorMapView = 'city' | 'core'
type OperatorMapProps = { forecastMinutes: number; layer?: OperatorMapLayer; onZoneSelect: (zoneId: string) => void; selectedZoneId?: string | undefined; view?: OperatorMapView; zones: readonly Zone[] }
const severityColors = { Low: '#bff5f1', Medium: '#43d7d0', High: '#f5b942', Critical: '#ef5a67' } as const
const basemapConfig = {
  lightPreset: 'day', theme: 'faded', show3dObjects: false, showPedestrianRoads: true, showPlaceLabels: true,
  showPointOfInterestLabels: true, showRoadLabels: true, showTransitLabels: true, densityPointOfInterestLabels: 3,
  colorWater: '#b9eef2', colorLand: '#f4f5f5', colorGreenspace: '#dcefdc', colorBuildings: '#e5e8ea',
  colorRoads: '#ffffff', colorMotorways: '#fff0bd', colorTrunks: '#fff7dc', colorPlaceLabels: '#52616b', colorRoadLabels: '#697780',
} as const

export function OperatorMap({ forecastMinutes, layer = 'gap', onZoneSelect, selectedZoneId, view = 'city', zones }: OperatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const zonesRef = useRef(zones)
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle')
  zonesRef.current = zones

  useEffect(() => {
    if (!containerRef.current || !env.hasMapboxToken) return undefined
    const container = containerRef.current
    const map = new mapboxgl.Map({ accessToken: env.mapboxAccessToken, container, style: 'mapbox://styles/mapbox/standard', config: { basemap: basemapConfig }, center: hanoiCenter, zoom: 12.1, pitch: 0, bearing: 0, attributionControl: false })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    map.on('load', () => {
      map.addSource('operator-zones', { type: 'geojson', data: zonesToFeatureCollection(zonesRef.current), promoteId: 'id' })
      map.addLayer({ id: 'zone-fill', type: 'fill', slot: 'middle', source: 'operator-zones', paint: { 'fill-color': fillColor('gap'), 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.88, ['==', ['get', 'dataStatus'], 'missing'], 0.38, 0.72], 'fill-emissive-strength': 1 } })
      map.addLayer({ id: 'zone-outline', type: 'line', slot: 'middle', source: 'operator-zones', paint: { 'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0a192f', 'rgba(255,255,255,0.8)'], 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0.55], 'line-emissive-strength': 1 } })
      map.on('mouseenter', 'zone-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'zone-fill', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'zone-fill', (event) => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') onZoneSelect(id) })
      map.resize()
      fitMapToZones(map, zonesRef.current)
      setMapStatus('ready')
    })
    map.on('error', () => { if (!map.isStyleLoaded()) setMapStatus('error') })
    return () => { resizeObserver.disconnect(); mapRef.current = null; map.remove() }
  }, [onZoneSelect])

  useEffect(() => {
    const source = mapRef.current?.getSource('operator-zones')
    if (source && 'setData' in source) source.setData(zonesToFeatureCollection(zones))
  }, [zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    map.setPaintProperty('zone-fill', 'fill-color', fillColor(layer))
  }, [layer])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    fitMapToZones(map, view === 'core' ? zones.filter((zone) => zone.aiZoneId <= 13) : zones)
  }, [view, zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    for (const zone of zones) map.setFeatureState({ source: 'operator-zones', id: zone.id }, { selected: zone.id === selectedZoneId })
    const zone = zones.find((candidate) => candidate.id === selectedZoneId)
    if (zone) map.flyTo({ center: zone.center, zoom: 11, essential: true })
  }, [selectedZoneId, zones])

  if (!env.hasMapboxToken) return <div className="grid h-full min-h-[480px] place-items-center rounded-2xl bg-sky-50 p-6 text-center lg:min-h-0"><div><p className="font-semibold text-ink">Chưa cấu hình Mapbox</p><p className="mt-1 text-sm text-muted">Thêm public token vào VITE_MAPBOX_ACCESS_TOKEN.</p></div></div>
  const timeLabel = forecastMinutes === 0 ? 'Hiện tại' : `Dự báo +${forecastMinutes} phút`
  return <div className="relative h-full min-h-[480px] overflow-hidden rounded-panel bg-sky-50 lg:min-h-0"><div ref={containerRef} className="h-full min-h-[480px] w-full lg:min-h-0" aria-label="Bản đồ vận hành 30 AI zone Hà Nội" /><div className="nf-live-map-heading"><p><LocateFixed size={14} />Hà Nội · {timeLabel}</p><small>30 AI zone cung — cầu theo thời gian</small></div><MapLegend />{mapStatus === 'idle' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-sky-50/80 text-sm text-muted">Đang tải bản đồ…</div>}{mapStatus === 'error' && <div className="absolute inset-x-4 top-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Không thể tải dữ liệu bản đồ. Kiểm tra token hoặc kết nối mạng.</div>}</div>
}

function fillColor(layer: OperatorMapLayer): mapboxgl.ExpressionSpecification {
  if (layer === 'demand') return ['interpolate', ['linear'], ['get', 'demand'], 0, '#e8f7f5', 12, '#78d8d1', 24, '#f4ada0', 36, '#a83426']
  if (layer === 'supply') return ['interpolate', ['linear'], ['get', 'supply'], 0, '#eef2f1', 8, '#b8e9e5', 18, '#2bb8ad', 30, '#0c6e69']
  return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#cbd5e1', ['match', ['get', 'severity'], 'Low', severityColors.Low, 'Medium', severityColors.Medium, 'High', severityColors.High, severityColors.Critical]]
}

function fitMapToZones(map: mapboxgl.Map, zones: readonly Zone[]) {
  const centers = zones.map((zone) => zone.center).filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
  if (!centers.length) return
  const bounds = centers.reduce((current, center) => current.extend(center), new mapboxgl.LngLatBounds(centers[0], centers[0]))
  map.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 11 })
}

function MapLegend() {
  return <div className="nf-live-map-legend">{Object.entries(severityColors).map(([level, color]) => <span key={level}><i style={{ backgroundColor: color }} />{{ Low: 'Đủ xe', Medium: 'Theo dõi', High: 'Thiếu', Critical: 'Nghiêm trọng' }[level as keyof typeof severityColors]}</span>)}</div>
}
