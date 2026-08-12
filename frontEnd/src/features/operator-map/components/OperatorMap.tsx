import * as mapboxgl from 'mapbox-gl/esm'
import { LocateFixed } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'

import { zoneCentersToFeatureCollection, zonesToFeatureCollection } from '@/features/operator-data'
import type { Zone } from '@/features/operator-data'
import { env } from '@/shared/config/env'

const hanoiCenter: [longitude: number, latitude: number] = [105.8342, 21.0278]
const rainThreshold = 0.3
type MapStatus = 'idle' | 'ready' | 'error'
export type OperatorMapLayer = 'gap' | 'demand' | 'supply'
export type OperatorMapView = 'city' | 'core'
type OperatorMapProps = {
  forecastMinutes: number
  layer?: OperatorMapLayer
  onZoneSelect: (zoneId: string) => void
  selectedZoneId?: string | undefined
  timeLabel?: string | undefined
  view?: OperatorMapView
  zones: readonly Zone[]
}
const gapColors = {
  balanced: '#d8e0de',
  deficitLow: '#f4ada0',
  deficitHigh: '#e0503c',
  surplus: '#2bb8ad',
} as const
export function OperatorMap({ forecastMinutes, layer = 'gap', onZoneSelect, selectedZoneId, timeLabel, view = 'city', zones }: OperatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const rainMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const layerRef = useRef(layer)
  const zonesRef = useRef(zones)
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle')
  zonesRef.current = zones
  layerRef.current = layer

  useEffect(() => {
    if (!containerRef.current || !env.hasMapboxToken) return undefined
    const container = containerRef.current
    const rainMarkers = rainMarkersRef.current
    const map = new mapboxgl.Map({
      accessToken: env.mapboxAccessToken,
      container,
      style: 'mapbox://styles/mapbox/light-v11',
      center: hanoiCenter,
      zoom: 10,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    map.on('load', () => {
      map.addSource('operator-zone-areas', {
        type: 'geojson',
        data: zonesToFeatureCollection(zonesRef.current),
        promoteId: 'id',
      })
      map.addSource('operator-zone-centers', {
        type: 'geojson',
        data: zoneCentersToFeatureCollection(zonesRef.current),
        promoteId: 'id',
      })
      map.addLayer({
        id: 'zone-area-fill',
        type: 'fill',
        slot: 'middle',
        source: 'operator-zone-areas',
        paint: {
          'fill-color': fillColor(layerRef.current),
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.23, 0.11],
          'fill-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'zone-area-outline',
        type: 'line',
        slot: 'middle',
        source: 'operator-zone-areas',
        paint: {
          'line-color': fillColor(layerRef.current),
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.8, 1.2],
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0.55],
          'line-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'zone-activity-dot',
        type: 'circle',
        slot: 'middle',
        source: 'operator-zone-centers',
        paint: {
          'circle-radius': activityRadius(layerRef.current),
          'circle-color': fillColor(layerRef.current),
          'circle-opacity': 0.78,
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#14302e', 'rgba(255,255,255,.82)'],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, 1.25],
          'circle-emissive-strength': 1,
        },
      })
      for (const layerId of ['zone-area-fill', 'zone-activity-dot']) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('click', layerId, (event) => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id === 'string') onZoneSelect(id)
        })
      }
      syncRainMarkers(map, rainMarkers, zonesRef.current)
      fitMapToZones(map, zonesRef.current)
      setMapStatus('ready')
    })
    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapStatus('error')
    })
    return () => {
      resizeObserver.disconnect()
      for (const marker of rainMarkers.values()) marker.remove()
      rainMarkers.clear()
      mapRef.current = null
      map.remove()
    }
  }, [onZoneSelect])

  useEffect(() => {
    const map = mapRef.current
    const areaSource = map?.getSource('operator-zone-areas')
    const centerSource = map?.getSource('operator-zone-centers')
    if (areaSource && 'setData' in areaSource) areaSource.setData(zonesToFeatureCollection(zones))
    if (centerSource && 'setData' in centerSource) centerSource.setData(zoneCentersToFeatureCollection(zones))
    if (map) syncRainMarkers(map, rainMarkersRef.current, zones)
  }, [zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const applyLayer = () => {
      if (!map.getLayer('zone-area-fill') || !map.getLayer('zone-area-outline') || !map.getLayer('zone-activity-dot')) return false
      for (const id of ['zone-area-fill', 'zone-area-outline', 'zone-activity-dot']) map.setPaintProperty(id, id === 'zone-activity-dot' ? 'circle-color' : id === 'zone-area-outline' ? 'line-color' : 'fill-color', fillColor(layer))
      map.setPaintProperty('zone-activity-dot', 'circle-radius', activityRadius(layer))
      return true
    }
    if (applyLayer()) return undefined
    map.once('styledata', applyLayer)
    return () => {
      map.off('styledata', applyLayer)
    }
  }, [layer])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    if (view === 'core') {
      map.easeTo({ center: hanoiCenter, zoom: 12, duration: 650, essential: true })
      return
    }
    fitMapToZones(map, zones, 650)
  }, [view, zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    for (const zone of zones) {
      const selected = zone.id === selectedZoneId
      map.setFeatureState({ source: 'operator-zone-areas', id: zone.id }, { selected })
      map.setFeatureState({ source: 'operator-zone-centers', id: zone.id }, { selected })
    }
    const zone = zones.find((candidate) => candidate.id === selectedZoneId)
    if (zone) map.flyTo({ center: zone.center, zoom: 11, essential: true })
  }, [selectedZoneId, zones])

  if (!env.hasMapboxToken)
    return (
      <div className="grid h-full min-h-[480px] place-items-center rounded-2xl bg-sky-50 p-6 text-center lg:min-h-0">
        <div>
          <p className="font-semibold text-ink">Chưa cấu hình Mapbox</p>
          <p className="mt-1 text-sm text-muted">Thêm public token vào VITE_MAPBOX_ACCESS_TOKEN.</p>
        </div>
      </div>
    )
  const resolvedTimeLabel = timeLabel ?? (forecastMinutes === 0 ? 'Hiện tại' : `Dự báo +${forecastMinutes} phút`)
  const rainingZones = zones.filter((zone) => zone.rainMmH >= rainThreshold).length
  const meanRain = zones.reduce((sum, zone) => sum + zone.rainMmH, 0) / Math.max(1, zones.length)
  return (
    <div className="relative h-full min-h-[480px] overflow-hidden rounded-panel bg-sky-50 lg:min-h-0">
      <div ref={containerRef} className="h-full min-h-[480px] w-full lg:min-h-0" aria-label="Bản đồ vận hành 30 AI zone Hà Nội" />
      <div className="nf-live-map-heading">
        <p>
          <LocateFixed size={14} />
          Hà Nội · {resolvedTimeLabel}
        </p>
        <small>
          {rainingZones}/30 zone đang mưa · trung bình {meanRain.toFixed(2)} mm/h
        </small>
      </div>
      <MapLegend layer={layer} />
      {mapStatus === 'idle' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-sky-50/80 text-sm text-muted">Đang tải bản đồ…</div>}
      {mapStatus === 'error' && <div className="absolute inset-x-4 top-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Không thể tải dữ liệu bản đồ. Kiểm tra token hoặc kết nối mạng.</div>}
    </div>
  )
}

function fillColor(layer: OperatorMapLayer): mapboxgl.ExpressionSpecification {
  if (layer === 'demand') return ['interpolate', ['linear'], ['get', 'demand'], 0, '#f9ded8', 20, '#f4ada0', 50, '#e0503c']
  if (layer === 'supply') return ['interpolate', ['linear'], ['get', 'supply'], 0, '#d9f4f1', 20, '#72d8d1', 60, '#0c6e69']
  return ['case', ['==', ['get', 'dataStatus'], 'missing'], '#cbd5e1', ['>=', ['get', 'operationalGap'], 8], gapColors.deficitHigh, ['>=', ['get', 'operationalGap'], 3], gapColors.deficitLow, ['<=', ['get', 'operationalGap'], -4], gapColors.surplus, gapColors.balanced]
}

function activityRadius(layer: OperatorMapLayer): mapboxgl.ExpressionSpecification {
  const property = layer === 'supply' ? 'supply' : 'demand'
  return ['interpolate', ['linear'], ['get', property], 0, 9, 5, 13, 15, 20, 30, 28, 60, 38]
}

function syncRainMarkers(map: mapboxgl.Map, markers: Map<string, mapboxgl.Marker>, zones: readonly Zone[]) {
  const raining = new Set(zones.filter((zone) => zone.rainMmH >= rainThreshold).map((zone) => zone.id))
  for (const [id, marker] of markers)
    if (!raining.has(id)) {
      marker.remove()
      markers.delete(id)
    }
  for (const zone of zones) {
    if (!raining.has(zone.id)) continue
    const existing = markers.get(zone.id)
    if (existing) {
      const element = existing.getElement()
      element.dataset.rain = zone.rainMmH.toFixed(2)
      element.title = `${zone.label}: ${zone.rainMmH.toFixed(2)} mm/h`
      element.classList.toggle('is-heavy', zone.rainMmH >= 0.65)
      continue
    }
    const element = document.createElement('div')
    element.className = `nf-rain-marker${zone.rainMmH >= 0.65 ? ' is-heavy' : ''}`
    element.dataset.rain = zone.rainMmH.toFixed(2)
    element.title = `${zone.label}: ${zone.rainMmH.toFixed(2)} mm/h`
    element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14.9A4 4 0 0 1 6 7.2a6 6 0 0 1 11.4 1.8A3.5 3.5 0 0 1 17 16H7a3 3 0 0 1-3-1.1Z"/><path d="m8 19-1 2m5-2-1 2m5-2-1 2"/></svg>'
    markers.set(zone.id, new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat(zone.center).addTo(map))
  }
}

function fitMapToZones(map: mapboxgl.Map, zones: readonly Zone[], duration = 0) {
  const centers = zones.map((zone) => zone.center).filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
  if (!centers.length) return
  const bounds = centers.reduce((current, center) => current.extend(center), new mapboxgl.LngLatBounds(centers[0], centers[0]))
  map.fitBounds(bounds, { padding: 58, duration, maxZoom: 10.7 })
}

function MapLegend({ layer }: { layer: OperatorMapLayer }) {
  const legend =
    layer === 'demand'
      ? {
          title: 'CHÚ GIẢI NHU CẦU',
          items: [
            ['#f9ded8', 'Thấp < 20 xe'],
            ['#f4ada0', 'Vừa 20–49 xe'],
            ['#e0503c', 'Cao ≥ 50 xe'],
          ],
        }
      : layer === 'supply'
        ? {
          title: 'CHÚ GIẢI CUNG XE',
            items: [
              ['#d9f4f1', 'Ít < 20 xe'],
              ['#72d8d1', 'Vừa 20–59 xe'],
              ['#0c6e69', 'Nhiều ≥ 60 xe'],
            ],
          }
        : {
            title: 'CHÚ GIẢI CHÊNH LỆCH',
            items: [
              [gapColors.deficitHigh, 'Thiếu ≥ 8 xe'],
              [gapColors.deficitLow, 'Thiếu 3–7 xe'],
              [gapColors.surplus, 'Dư ≥ 4 xe'],
              [gapColors.balanced, 'Cân bằng −3…+2'],
            ],
          }
  return (
    <div className="nf-live-map-legend">
      <strong>{legend.title}</strong>
      {legend.items.map(([color, label]) => (
        <span key={label}>
          <i style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
      <p>
        <b className="nf-legend-area" />
        Vòng mờ: diện tích thật
      </p>
      <p>
        <b className="nf-legend-rain">☁</b>Icon mưa: zone ≥ 0,3 mm/h
      </p>
    </div>
  )
}
