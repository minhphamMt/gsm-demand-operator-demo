import * as mapboxgl from 'mapbox-gl/esm'
import { LocateFixed } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'

import { zonesToFeatureCollection } from '@/features/operator-data'
import type { Zone } from '@/features/operator-data'
import { env } from '@/shared/config/env'

const hanoiCenter: [longitude: number, latitude: number] = [105.8342, 21.0278]
type MapStatus = 'idle' | 'ready' | 'error'
type OperatorMapProps = { forecastMinutes: number; onZoneSelect: (zoneId: string) => void; selectedZoneId?: string | undefined; zones: readonly Zone[] }
const severityColors = { Low: '#bff5f1', Medium: '#43d7d0', High: '#f5b942', Critical: '#ef5a67' } as const
const basemapConfig = {
  lightPreset: 'day', theme: 'faded', show3dObjects: false, showPedestrianRoads: true, showPlaceLabels: true,
  showPointOfInterestLabels: true, showRoadLabels: true, showTransitLabels: true, densityPointOfInterestLabels: 3,
  colorWater: '#b9eef2', colorLand: '#f4f5f5', colorGreenspace: '#dcefdc', colorBuildings: '#e5e8ea',
  colorRoads: '#ffffff', colorMotorways: '#fff0bd', colorTrunks: '#fff7dc', colorPlaceLabels: '#52616b', colorRoadLabels: '#697780',
} as const

export function OperatorMap({ forecastMinutes, onZoneSelect, selectedZoneId, zones }: OperatorMapProps) {
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
      map.addLayer({ id: 'zone-fill', type: 'fill', slot: 'middle', source: 'operator-zones', paint: { 'fill-color': ['match', ['get', 'severity'], 'Low', severityColors.Low, 'Medium', severityColors.Medium, 'High', severityColors.High, severityColors.Critical], 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.88, 0.72], 'fill-emissive-strength': 1 } })
      map.addLayer({ id: 'zone-outline', type: 'line', slot: 'middle', source: 'operator-zones', paint: { 'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0a192f', 'rgba(255,255,255,0.8)'], 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0.55], 'line-emissive-strength': 1 } })
      map.on('mouseenter', 'zone-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'zone-fill', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'zone-fill', (event) => { const id = event.features?.[0]?.properties?.id; if (typeof id === 'string') onZoneSelect(id) })
      map.resize()
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
    for (const zone of zones) map.setFeatureState({ source: 'operator-zones', id: zone.id }, { selected: zone.id === selectedZoneId })
    const zone = zones.find((candidate) => candidate.id === selectedZoneId)
    if (zone) map.flyTo({ center: zone.center, zoom: 13.1, essential: true })
  }, [selectedZoneId, zones])

  if (!env.hasMapboxToken) return <div className="grid h-full min-h-[480px] place-items-center rounded-2xl bg-sky-50 p-6 text-center lg:min-h-0"><div><p className="font-semibold text-ink">Chưa cấu hình Mapbox</p><p className="mt-1 text-sm text-muted">Thêm public token vào VITE_MAPBOX_ACCESS_TOKEN.</p></div></div>
  const timeLabel = forecastMinutes === 0 ? 'Hiện tại' : `Dự báo +${forecastMinutes} phút`
  return <div className="relative h-full min-h-[480px] overflow-hidden rounded-panel bg-sky-50 lg:min-h-0"><div ref={containerRef} className="h-full min-h-[480px] w-full lg:min-h-0" aria-label="Bản đồ vận hành khu vực Hà Nội" /><div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/70 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"><p className="flex items-center gap-1.5 text-xs font-bold text-ink"><LocateFixed className="size-3.5 text-brand-600" />Hà Nội · {timeLabel}</p><p className="mt-0.5 text-[11px] text-muted">Heatmap H3 cung — cầu theo thời gian</p></div><MapLegend />{mapStatus === 'idle' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-sky-50/80 text-sm text-muted">Đang tải bản đồ…</div>}{mapStatus === 'error' && <div className="absolute inset-x-4 top-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Không thể tải dữ liệu bản đồ. Kiểm tra token hoặc kết nối mạng.</div>}</div>
}

function MapLegend() {
  return <div className="pointer-events-none absolute bottom-9 left-3 flex flex-wrap gap-2 rounded-xl border border-white/70 bg-white/90 p-2 shadow-lg backdrop-blur">{Object.entries(severityColors).map(([level, color]) => <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700" key={level}><span className="size-2 rounded-sm" style={{ backgroundColor: color }} />{{ Low: 'Đủ xe', Medium: 'Theo dõi', High: 'Thiếu', Critical: 'Nghiêm trọng' }[level as keyof typeof severityColors]}</span>)}</div>
}
