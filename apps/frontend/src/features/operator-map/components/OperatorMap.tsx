import * as mapboxgl from 'mapbox-gl/esm'
import { LocateFixed } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'

import { zoneCentersToFeatureCollection, zonesToFeatureCollection } from '@/features/operator-data'
import type { Move, Zone } from '@/features/operator-data'
import { buildFlowCollections, mapLegendFor, mapTheme, mapViewportForView, zoneDotRadius, zoneFillColor, zoneStrokeColor, zonesForMapView } from '@/features/operator-map/model/operatorMapGeometry'
import type { FlowState } from '@/features/operator-map/model/operatorMapGeometry'
import { env } from '@/shared/config/env'

// Keep the map aligned with the policy/regime threshold used by the AI service.
const rainThreshold = 0.5
const mapLoadTimeoutMs = 15_000
type MapStatus = 'idle' | 'ready' | 'error'
export type MapFailureKind = 'network' | 'timeout' | 'token-style' | 'unknown'
export type OperatorMapLayer = 'gap' | 'demand' | 'supply'
export type OperatorMapView = 'city' | 'core'
type OperatorMapProps = {
  forecastMinutes: number
  flowState?: FlowState
  layer?: OperatorMapLayer
  moves?: readonly Move[]
  onZoneSelect: (zoneId: string) => void
  selectedZoneId?: string | undefined
  timeLabel?: string | undefined
  view?: OperatorMapView
  zones: readonly Zone[]
}

export function classifyMapFailure(error: unknown): MapFailureKind {
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  const normalized = detail.toLocaleLowerCase()
  if (/access token|not authorized|unauthorized|forbidden|\b401\b|\b403\b|style.*(not found|denied)/.test(normalized)) return 'token-style'
  if (/network|failed to fetch|networkerror|offline|err_internet|xhr/.test(normalized)) return 'network'
  return 'unknown'
}

function mapFailureCopy(kind: MapFailureKind) {
  if (kind === 'token-style') return 'Mapbox từ chối token hoặc style. Kiểm tra URL restriction, scope và style đã cấu hình.'
  if (kind === 'network') return 'Không kết nối được tới Mapbox. Kiểm tra mạng rồi thử lại; danh sách zone vẫn dùng được.'
  if (kind === 'timeout') return 'Mapbox tải quá lâu. Hãy thử lại; danh sách zone vẫn dùng được.'
  return 'Không thể tải bản đồ. Hãy thử lại hoặc tiếp tục thao tác bằng danh sách zone.'
}

export function OperatorMap({ forecastMinutes, flowState = 'proposal', layer = 'gap', moves = [], onZoneSelect, selectedZoneId, timeLabel, view = 'city', zones }: OperatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const rainMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const flowStateRef = useRef(flowState)
  const layerRef = useRef(layer)
  const movesRef = useRef(moves)
  const viewRef = useRef(view)
  const zonesRef = useRef(zones)
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle')
  const [mapFailure, setMapFailure] = useState<MapFailureKind | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  zonesRef.current = zones
  layerRef.current = layer
  movesRef.current = moves
  viewRef.current = view
  flowStateRef.current = flowState

  useEffect(() => {
    if (!containerRef.current || !env.hasMapboxToken) return undefined
    const container = containerRef.current
    const rainMarkers = rainMarkersRef.current
    const initialViewport = mapViewportForView(viewRef.current)
    const map = new mapboxgl.Map({
      accessToken: env.mapboxAccessToken,
      container,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialViewport.center,
      zoom: initialViewport.zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })
    mapRef.current = map
    let ready = false
    const fail = (kind: MapFailureKind) => {
      if (ready) return
      window.clearTimeout(loadTimeout)
      setMapFailure(kind)
      setMapStatus('error')
    }
    const loadTimeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) fail('timeout')
    }, mapLoadTimeoutMs)
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    map.on('load', () => {
      ready = true
      window.clearTimeout(loadTimeout)
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
      const flows = buildFlowCollections(zonesRef.current, movesRef.current)
      map.addSource('operator-move-flows', { type: 'geojson', data: flows.routes })
      map.addSource('operator-move-labels', { type: 'geojson', data: flows.labels })
      map.addLayer({
        id: 'zone-area-fill',
        type: 'fill',
        slot: 'middle',
        source: 'operator-zone-areas',
        paint: {
          'fill-color': zoneFillColor(layerRef.current),
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.2, 0.11],
          'fill-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'zone-area-outline',
        type: 'line',
        slot: 'middle',
        source: 'operator-zone-areas',
        paint: {
          'line-color': zoneStrokeColor(layerRef.current),
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.4, 1.15],
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.85, 0.45],
          'line-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'move-flow-casing',
        type: 'line',
        slot: 'middle',
        source: 'operator-move-flows',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': 'rgba(255,255,255,.9)',
          'line-width': ['+', ['get', 'width'], 3],
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'move-flow-line',
        type: 'line',
        slot: 'middle',
        source: 'operator-move-flows',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': flowStateRef.current === 'completed' ? mapTheme.flowComplete : mapTheme.flow,
          'line-width': ['get', 'width'],
          'line-opacity': 0.92,
          'line-dasharray': flowStateRef.current === 'executing' ? [1.4, 1] : [1, 0],
        },
      })
      map.addLayer({
        id: 'zone-activity-dot',
        type: 'circle',
        slot: 'middle',
        source: 'operator-zone-centers',
        paint: {
          'circle-radius': zoneDotRadius(layerRef.current),
          'circle-color': zoneFillColor(layerRef.current),
          'circle-opacity': layerRef.current === 'gap' ? 0.75 : 1,
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], mapTheme.ink, 'rgba(255,255,255,.9)'],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.2],
          'circle-emissive-strength': 1,
        },
      })
      map.addLayer({
        id: 'move-flow-label',
        type: 'symbol',
        slot: 'middle',
        source: 'operator-move-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 10,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': flowStateRef.current === 'completed' ? mapTheme.flowComplete : mapTheme.flow,
          'text-halo-width': 4,
          'text-halo-blur': 0.2,
        },
      })
      map.addLayer({
        id: 'zone-severe-label',
        type: 'symbol',
        slot: 'middle',
        source: 'operator-zone-centers',
        filter: ['>=', ['get', 'operationalGap'], 8],
        layout: {
          'text-anchor': 'left',
          'text-field': ['get', 'label'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-offset': [1.8, -0.55],
          'text-size': 11,
        },
        paint: {
          'text-color': mapTheme.ink,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
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
      moveMapToView(map, viewRef.current)
      setMapStatus('ready')
    })
    map.on('error', (event) => fail(classifyMapFailure(event.error)))
    return () => {
      window.clearTimeout(loadTimeout)
      resizeObserver.disconnect()
      for (const marker of rainMarkers.values()) marker.remove()
      rainMarkers.clear()
      mapRef.current = null
      map.remove()
    }
  }, [onZoneSelect, retryAttempt])

  useEffect(() => {
    const map = mapRef.current
    const areaSource = map?.getSource('operator-zone-areas')
    const centerSource = map?.getSource('operator-zone-centers')
    if (areaSource && 'setData' in areaSource) areaSource.setData(zonesToFeatureCollection(zones))
    if (centerSource && 'setData' in centerSource) centerSource.setData(zoneCentersToFeatureCollection(zones))
    const flows = buildFlowCollections(zones, moves)
    const flowSource = map?.getSource('operator-move-flows')
    const flowLabelSource = map?.getSource('operator-move-labels')
    if (flowSource && 'setData' in flowSource) flowSource.setData(flows.routes)
    if (flowLabelSource && 'setData' in flowLabelSource) flowLabelSource.setData(flows.labels)
    if (map) syncRainMarkers(map, rainMarkersRef.current, zones)
  }, [moves, zones])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const applyLayer = () => {
      if (!map.getLayer('zone-area-fill') || !map.getLayer('zone-area-outline') || !map.getLayer('zone-activity-dot')) return false
      map.setPaintProperty('zone-area-fill', 'fill-color', zoneFillColor(layer))
      map.setPaintProperty('zone-area-outline', 'line-color', zoneStrokeColor(layer))
      map.setPaintProperty('zone-activity-dot', 'circle-color', zoneFillColor(layer))
      map.setPaintProperty('zone-activity-dot', 'circle-radius', zoneDotRadius(layer))
      map.setPaintProperty('zone-activity-dot', 'circle-opacity', layer === 'gap' ? 0.75 : 1)
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
    if (!map?.getLayer('move-flow-line') || !map.getLayer('move-flow-label')) return
    const color = flowState === 'completed' ? mapTheme.flowComplete : mapTheme.flow
    map.setPaintProperty('move-flow-line', 'line-color', color)
    map.setPaintProperty('move-flow-line', 'line-dasharray', flowState === 'executing' ? [1.4, 1] : [1, 0])
    map.setPaintProperty('move-flow-label', 'text-halo-color', color)
  }, [flowState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== 'ready') return undefined
    const frame = window.requestAnimationFrame(() => {
      map.resize()
      moveMapToView(map, view, 950)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mapStatus, view])

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
          <p className="mt-3 text-xs text-muted">Khu vực vẫn là vùng đại diện AI zone, không phải ranh giới hành chính.</p>
        </div>
      </div>
    )
  const resolvedTimeLabel = timeLabel ?? (forecastMinutes === 0 ? 'Hiện tại' : `Dự báo +${forecastMinutes} phút`)
  const visibleZoneCount = zonesForMapView(zones, view).length
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
          {view === 'core' ? `Vùng lõi · ${visibleZoneCount}/${zones.length} zone` : `Toàn thành phố · ${zones.length} zone`} · {rainingZones} zone đang mưa · trung bình {meanRain.toFixed(2)} mm/h
        </small>
      </div>
      <MapLegend forecastMinutes={forecastMinutes} layer={layer} />
      {mapStatus === 'idle' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-sky-50/80 text-sm text-muted">Đang tải bản đồ…</div>}
      {mapStatus === 'error' && <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{mapFailureCopy(mapFailure ?? 'unknown')}</span><button className="btn btn-secondary shrink-0" onClick={() => { setMapFailure(null); setMapStatus('idle'); setRetryAttempt((value) => value + 1) }} type="button">Thử lại bản đồ</button></div>}
    </div>
  )
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

function moveMapToView(map: mapboxgl.Map, view: OperatorMapView, duration = 0) {
  const viewport = mapViewportForView(view)
  map.stop()
  if (duration === 0) {
    map.jumpTo({ center: viewport.center, zoom: viewport.zoom })
    return
  }
  map.easeTo({
    center: viewport.center,
    zoom: viewport.zoom,
    duration,
    essential: true,
  })
}

function MapLegend({ forecastMinutes, layer }: { forecastMinutes: number; layer: OperatorMapLayer }) {
  const legend = mapLegendFor(layer, forecastMinutes)
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
        Vùng mờ: khu vực đại diện AI, không phải ranh giới hành chính
      </p>
      <p>
        <b className="nf-legend-rain">☁</b>Icon mưa: zone ≥ 0,5 mm/h
      </p>
    </div>
  )
}
