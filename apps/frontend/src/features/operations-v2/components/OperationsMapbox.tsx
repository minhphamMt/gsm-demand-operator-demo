import * as mapboxgl from 'mapbox-gl/esm'
import { AlertTriangle, CarFront, LocateFixed, MapPinned, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'

import { env } from '@/shared/config/env'
import type { OperationsMapProps } from './OperationsMap'
import { forecastBoundary, mapZonesAtHorizon, operationsFlowCollections, operationsPassengers, operationsVehicles, operationsZoneAreas, operationsZoneCenters } from '../data/mapData'
import { operationsNetworkAtHorizon, zoneById } from '../data/mockData'
import type { FlowStage, ForecastHorizon } from '../types'
import carImageUrl from '../assets/operations-car-cartoon.png'

type MapStatus = 'idle' | 'ready' | 'error'

export function OperationsMapbox({ horizon, flowStage, selectedZoneId, onZoneSelect, compact = false, showShortage = true }: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [mapStatus, setMapStatus] = useState<MapStatus>('idle')
  const [mapError, setMapError] = useState('')
  const [retryAttempt, setRetryAttempt] = useState(0)
  const network = operationsNetworkAtHorizon(horizon)
  const baselineNetwork = operationsNetworkAtHorizon(0)
  const demandDelta = horizon === 0 ? 0 : Math.round((network.demand / baselineNetwork.demand - 1) * 100)
  const supplyDrop = horizon === 0 ? 0 : Math.max(0, Math.round((1 - network.supply / baselineNetwork.supply) * 100))
  const dynamicProps = useRef({ horizon, flowStage, selectedZoneId, showShortage, onZoneSelect })
  const motionRef = useRef(0)
  dynamicProps.current = { horizon, flowStage, selectedZoneId, showShortage, onZoneSelect }

  useEffect(() => {
    if (!containerRef.current || !env.hasMapboxToken) return undefined
    const container = containerRef.current
    const map = new mapboxgl.Map({
      accessToken: env.mapboxAccessToken,
      container,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [105.834, 21.03],
      zoom: 10.55,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })
    mapRef.current = map
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    const timeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) {
        setMapError('Mapbox tải quá lâu. Kiểm tra kết nối hoặc token rồi thử lại.')
        setMapStatus('error')
      }
    }, 15_000)

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.on('load', async () => {
      window.clearTimeout(timeout)
      const current = dynamicProps.current
      const mapZones = mapZonesAtHorizon(current.horizon)
      await addVehicleImage(map)
      addMapSourcesAndLayers(map, mapZones, current.flowStage, current.horizon)
      syncMap(map, current.horizon, current.flowStage, current.showShortage, motionRef.current)
      applySelectedZone(map, current.selectedZoneId, mapZones)
      setMapStatus('ready')
    })
    map.on('error', (event) => {
      if (map.isStyleLoaded()) return
      setMapError(event.error instanceof Error ? event.error.message : 'Không thể tải bản đồ Mapbox.')
      setMapStatus('error')
    })
    map.on('click', 'operations-v2-zone-fill', (event) => {
      const mapId = event.features?.[0]?.properties?.id
      if (typeof mapId === 'string') {
        const mapZone = mapZonesAtHorizon(dynamicProps.current.horizon).find((zone) => zone.id === mapId)
        const operationsZone = mapZone ? Object.values(zoneById).find((zone) => zone.name === mapZone.label) : undefined
        dynamicProps.current.onZoneSelect(operationsZone?.id ?? mapId)
      }
    })
    map.on('mouseenter', 'operations-v2-zone-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'operations-v2-zone-fill', () => { map.getCanvas().style.cursor = '' })

    return () => {
      window.clearTimeout(timeout)
      resizeObserver.disconnect()
      mapRef.current = null
      map.remove()
    }
  }, [retryAttempt])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== 'ready') return
    const mapZones = mapZonesAtHorizon(horizon)
    syncMap(map, horizon, flowStage, showShortage, motionRef.current)
    applySelectedZone(map, selectedZoneId, mapZones)
    map.resize()
  }, [flowStage, horizon, mapStatus, selectedZoneId, showShortage])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== 'ready') return
    const motionTimer = window.setInterval(() => {
      const current = dynamicProps.current
      const zones = mapZonesAtHorizon(current.horizon)
      motionRef.current += 1
      setSourceData(map, 'operations-v2-vehicles', operationsVehicles(zones, current.flowStage, motionRef.current, current.horizon))
    }, 1200)
    return () => window.clearInterval(motionTimer)
  }, [mapStatus])

  return <div className={`operations-map operations-map--mapbox ${compact ? 'operations-map--compact' : ''} ${isExecutionStage(flowStage) ? 'operations-map--execution' : ''}`}>
    <div className="map-toolbar">
      <div className="map-toolbar__title"><MapPinned size={14} /><span>MAPBOX · LƯỚI ĐIỀU PHỐI HÀ NỘI</span><span className={`map-live-dot ${horizon > 0 ? 'map-live-dot--forecast' : ''}`} /></div>
      <div className="map-toolbar__legend"><span><i className="legend-line legend-line--solid" /> HIỆN TẠI</span><span><i className="legend-line legend-line--dash" /> DỰ BÁO</span></div>
    </div>
    <div className="operations-mapbox__canvas" ref={containerRef} aria-label="Bản đồ Mapbox điều hành các zone Hà Nội" />
    <div className="operations-mapbox__heading"><span><LocateFixed size={13} /> Hà Nội · {horizon === 0 ? 'HIỆN TẠI' : `DỰ BÁO +${horizon} PHÚT`}</span><small>{horizon === 0 ? 'lớp dữ liệu hiện tại' : 'ranh giới nét đứt · lớp dự báo'}</small></div>
    <div className="operations-mapbox__forecast-metrics" aria-live="polite"><span><strong>{network.demand.toLocaleString('vi-VN')}</strong> {horizon === 0 ? 'cuốc hiện tại' : 'cuốc dự báo'}</span><span><strong>{network.supply.toLocaleString('vi-VN')}</strong> xe sẵn sàng</span>{horizon > 0 && <b>Nhu cầu +{demandDelta}% · nguồn xe -{supplyDrop}%</b>}</div>
    <div className="operations-mapbox__legend"><span><i className="mapbox-key mapbox-key--balanced" /> CÂN BẰNG</span><span><i className="mapbox-key mapbox-key--watch" /> THEO DÕI</span><span><i className="mapbox-key mapbox-key--abnormal" /> BẤT THƯỜNG</span><span><i className="mapbox-key mapbox-key--shortage" /> <AlertTriangle size={10} /> THIẾU XE</span></div>
    <div className="map-status-bar"><span><i className="map-status-key map-status-key--green" /> Dữ liệu bản đồ <strong>{mapStatus === 'ready' ? 'đã kết nối' : 'đang kết nối'}</strong></span><span><CarFront size={13} /> {isExecutionStage(flowStage) ? '58 xe đang di chuyển' : `${network.supply.toLocaleString('vi-VN')} xe trực tuyến`}</span><span><UsersRound size={13} /> {horizon > 0 ? `Nhu cầu dự báo ${network.demand.toLocaleString('vi-VN')}` : `Nhu cầu hiện tại ${network.demand.toLocaleString('vi-VN')}`}</span></div>
    {mapStatus === 'idle' && <div className="operations-mapbox__loading">Đang tải bản đồ Mapbox…</div>}
    {mapStatus === 'error' && <div className="operations-mapbox__error"><strong>Không thể tải Mapbox</strong><span>{mapError || 'Không thể tải bản đồ Mapbox.'}</span><button className="ops-button ops-button--ghost" onClick={() => { setMapError(''); setMapStatus('idle'); setRetryAttempt((value) => value + 1) }} type="button">Thử lại bản đồ</button></div>}
  </div>
}

function addMapSourcesAndLayers(map: mapboxgl.Map, zones: readonly ReturnType<typeof mapZonesAtHorizon>[number][], flowStage: FlowStage, horizon: ForecastHorizon) {
  const flows = operationsFlowCollections(zones)
  map.addSource('operations-v2-zone-areas', { type: 'geojson', data: operationsZoneAreas(zones), promoteId: 'id' })
  map.addSource('operations-v2-zone-centers', { type: 'geojson', data: operationsZoneCenters(zones), promoteId: 'id' })
  map.addSource('operations-v2-routes', { type: 'geojson', data: flows.routes })
  map.addSource('operations-v2-route-labels', { type: 'geojson', data: flows.labels })
  map.addSource('operations-v2-vehicles', { type: 'geojson', data: operationsVehicles(zones, flowStage, 0, horizon) })
  map.addSource('operations-v2-passengers', { type: 'geojson', data: operationsPassengers(zones, horizon) })
  map.addSource('operations-v2-forecast-boundary', { type: 'geojson', data: forecastBoundary(zones) })

  map.addLayer({ id: 'operations-v2-forecast-fill', type: 'fill', source: 'operations-v2-forecast-boundary', paint: { 'fill-color': '#d49a4a', 'fill-opacity': 0.04 }, layout: { visibility: 'none' } })
  map.addLayer({ id: 'operations-v2-forecast-outline', type: 'line', source: 'operations-v2-forecast-boundary', paint: { 'line-color': '#d49a4a', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.72 }, layout: { visibility: 'none' } })
  map.addLayer({ id: 'operations-v2-zone-fill', type: 'fill', slot: 'middle', source: 'operations-v2-zone-areas', paint: { 'fill-color': zoneFillExpression, 'fill-opacity': zoneOpacityExpression } })
  map.addLayer({ id: 'operations-v2-zone-hatch', type: 'line', slot: 'middle', source: 'operations-v2-zone-areas', paint: { 'line-color': '#e16f6f', 'line-width': 2, 'line-dasharray': [1, 2], 'line-opacity': ['case', ['==', ['get', 'status'], 'SHORTAGE'], 0.82, 0] } })
  map.addLayer({ id: 'operations-v2-zone-outline', type: 'line', slot: 'middle', source: 'operations-v2-zone-areas', paint: { 'line-color': zoneStrokeExpression, 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.25], 'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.92, 0.62] } })
  map.addLayer({ id: 'operations-v2-zone-risk', type: 'circle', slot: 'middle', source: 'operations-v2-zone-centers', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'demand'], 100, 5, 220, 9, 340, 13, 460, 17], 'circle-color': zoneStrokeExpression, 'circle-opacity': ['interpolate', ['linear'], ['get', 'risk'], 0, 0.38, 50, 0.62, 90, 0.9], 'circle-stroke-color': '#091115', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'operations-v2-zone-label', type: 'symbol', slot: 'top', source: 'operations-v2-zone-centers', layout: { 'text-field': ['case', ['>=', ['get', 'risk'], 50], ['concat', ['get', 'label'], ' · ', ['get', 'statusLabel'], ' · ', ['to-string', ['get', 'demand']], ' cuốc'], ['concat', ['get', 'label'], ' · ', ['get', 'statusLabel']]], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 10, 'text-offset': [0.8, 0], 'text-anchor': 'left', 'text-allow-overlap': false }, paint: { 'text-color': '#e4ece8', 'text-halo-color': '#111c21', 'text-halo-width': 2 } })
  map.addLayer({ id: 'operations-v2-zone-alert', type: 'symbol', slot: 'top', source: 'operations-v2-zone-centers', filter: ['>=', ['get', 'risk'], 50], layout: { 'text-field': '⚠', 'text-size': 14, 'text-offset': [0, -1.45], 'text-allow-overlap': true }, paint: { 'text-color': '#ec835a', 'text-halo-color': '#111c21', 'text-halo-width': 1.5 } })
  map.addLayer({ id: 'operations-v2-route-casing', type: 'line', slot: 'top', source: 'operations-v2-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0c1519', 'line-width': ['+', ['get', 'width'], 4], 'line-opacity': 0.76 } })
  map.addLayer({ id: 'operations-v2-route-line', type: 'line', slot: 'top', source: 'operations-v2-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4ad0bd', 'line-width': ['get', 'width'], 'line-opacity': 0.95, 'line-dasharray': isExecutionStage(flowStage) ? [1.2, 1] : [1, 0] } })
  map.addLayer({ id: 'operations-v2-route-label', type: 'symbol', slot: 'top', source: 'operations-v2-route-labels', layout: { 'text-field': ['get', 'label'], 'text-size': 9, 'text-allow-overlap': true }, paint: { 'text-color': '#8ee4d4', 'text-halo-color': '#0c1519', 'text-halo-width': 2 } })
  map.addLayer({ id: 'operations-v2-vehicle-dot', type: 'circle', slot: 'top', source: 'operations-v2-vehicles', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 13, 9, 16, 12], 'circle-color': vehicleColorExpression, 'circle-opacity': 0.24, 'circle-stroke-color': vehicleColorExpression, 'circle-stroke-width': 1.5 } })
  if (map.hasImage('operations-v2-car')) map.addLayer({ id: 'operations-v2-vehicle-icon', type: 'symbol', slot: 'top', source: 'operations-v2-vehicles', layout: { 'icon-image': 'operations-v2-car', 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.07, 12, 0.1, 15, 0.14], 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': 0.98 } })
  map.addLayer({ id: 'operations-v2-passenger-dot', type: 'circle', slot: 'top', source: 'operations-v2-passengers', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'load'], 100, 6, 180, 9, 260, 13], 'circle-color': '#ec835a', 'circle-opacity': 0.9, 'circle-stroke-color': '#2d1714', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'operations-v2-passenger-glyph', type: 'symbol', slot: 'top', source: 'operations-v2-passengers', layout: { 'text-field': 'P', 'text-size': 9, 'text-allow-overlap': true }, paint: { 'text-color': '#fff4ef', 'text-halo-color': '#2d1714', 'text-halo-width': 1 } })
}

function addVehicleImage(map: mapboxgl.Map) {
  if (map.hasImage('operations-v2-car')) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    map.loadImage(carImageUrl, (error, image) => {
      if (error || !image) {
        resolve(false)
        return
      }
      map.addImage('operations-v2-car', image, { pixelRatio: 4 })
      resolve(true)
    })
  })
}

function syncMap(map: mapboxgl.Map, horizon: ForecastHorizon, flowStage: FlowStage, showShortage: boolean, motionTick = 0) {
  const zones = mapZonesAtHorizon(horizon)
  setSourceData(map, 'operations-v2-zone-areas', operationsZoneAreas(zones))
  setSourceData(map, 'operations-v2-zone-centers', operationsZoneCenters(zones))
  setSourceData(map, 'operations-v2-vehicles', operationsVehicles(zones, flowStage, motionTick, horizon))
  setSourceData(map, 'operations-v2-passengers', operationsPassengers(zones, horizon))
  setSourceData(map, 'operations-v2-forecast-boundary', forecastBoundary(zones))
  const flows = operationsFlowCollections(zones)
  setSourceData(map, 'operations-v2-routes', flows.routes)
  setSourceData(map, 'operations-v2-route-labels', flows.labels)
  if (map.getLayer('operations-v2-forecast-fill')) map.setLayoutProperty('operations-v2-forecast-fill', 'visibility', horizon > 0 ? 'visible' : 'none')
  if (map.getLayer('operations-v2-forecast-outline')) map.setLayoutProperty('operations-v2-forecast-outline', 'visibility', horizon > 0 ? 'visible' : 'none')
  for (const layerId of ['operations-v2-zone-hatch', 'operations-v2-zone-alert', 'operations-v2-passenger-dot', 'operations-v2-passenger-glyph']) if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', showShortage ? 'visible' : 'none')
  if (map.getLayer('operations-v2-route-line')) map.setPaintProperty('operations-v2-route-line', 'line-dasharray', isExecutionStage(flowStage) ? [1.2, 1] : [1, 0])
}

function setSourceData(map: mapboxgl.Map, sourceId: string, data: unknown) {
  const source = map.getSource(sourceId)
  if (source && 'setData' in source) source.setData(data as never)
}

function applySelectedZone(map: mapboxgl.Map, selectedZoneId: string, zones: readonly ReturnType<typeof mapZonesAtHorizon>[number][]) {
  if (!map.getSource('operations-v2-zone-areas')) return
  for (const zone of zones) map.setFeatureState({ source: 'operations-v2-zone-areas', id: zone.id }, { selected: zone.id === selectedZoneId })
  for (const zone of zones) map.setFeatureState({ source: 'operations-v2-zone-centers', id: zone.id }, { selected: zone.id === selectedZoneId })
  const selected = zones.find((zone) => zone.label === zoneById[selectedZoneId]?.name)
  if (selected) map.flyTo({ center: selected.center, zoom: 11.4, duration: 700, essential: true })
}

function isExecutionStage(flowStage: FlowStage) {
  return flowStage === 'DISPATCHING' || flowStage === 'EXECUTING' || flowStage === 'NEW_DATA' || flowStage === 'REPLAN_READY' || flowStage === 'UPDATE_APPROVED'
}

const zoneFillExpression = ['match', ['get', 'status'], 'SHORTAGE', '#64343d', 'ABNORMAL', '#5f4039', 'WATCH', '#5c4d2e', 'BALANCED', '#1e403c', '#263139'] as mapboxgl.ExpressionSpecification
const zoneStrokeExpression = ['match', ['get', 'status'], 'SHORTAGE', '#d45252', 'ABNORMAL', '#ec835a', 'WATCH', '#eeb151', 'BALANCED', '#35b7a5', '#82918d'] as mapboxgl.ExpressionSpecification
const zoneOpacityExpression = ['case', ['boolean', ['feature-state', 'selected'], false], 0.47, 0.27] as mapboxgl.ExpressionSpecification
const vehicleColorExpression = ['match', ['get', 'status'], 'SHORTAGE', '#d45252', 'MOVING', '#7fa9f5', '#54d4c1'] as mapboxgl.ExpressionSpecification
