import { AlertTriangle, ArrowUpRight, CarFront, CircleDot, MapPinned, UsersRound } from 'lucide-react'
import { env } from '@/shared/config/env'
import type { FlowStage, ForecastHorizon, OperationsZone, Vehicle } from '../types'
import { fleet, operationsNetworkAtHorizon, operationsZonesAtHorizon } from '../data/mockData'
import { OperationsMapbox } from './OperationsMapbox'
import { zoneStatusLabels } from '../uiLabels'
import carImageUrl from '@/features/operations-v2/assets/operations-car-cartoon.png'

const statusLabel: Record<OperationsZone['status'], string> = zoneStatusLabels
const statusClass: Record<OperationsZone['status'], string> = { BALANCED: 'good', WATCH: 'watch', ABNORMAL: 'abnormal', SHORTAGE: 'shortage' }

export type OperationsMapProps = {
  zones: OperationsZone[]
  horizon: ForecastHorizon
  flowStage: FlowStage
  selectedZoneId: string
  onZoneSelect: (id: string) => void
  compact?: boolean
  showShortage?: boolean
}

export function OperationsMap(props: OperationsMapProps) {
  return env.hasMapboxToken ? <OperationsMapbox {...props} /> : <SvgOperationsMap {...props} />
}

export function SvgOperationsMap({ horizon, flowStage, selectedZoneId, onZoneSelect, compact = false, showShortage = true }: OperationsMapProps) {
  const executionMode = flowStage === 'EXECUTING' || flowStage === 'DISPATCHING' || flowStage === 'NEW_DATA' || flowStage === 'REPLAN_READY' || flowStage === 'UPDATE_APPROVED'
  const forecastMode = horizon > 0
  const displayZones = operationsZonesAtHorizon(horizon)
  const network = operationsNetworkAtHorizon(horizon)
  const visibleVehicles = executionMode ? fleet.map((vehicle, index) => vehicle.status === 'NORMAL' && index % 2 === 0 ? { ...vehicle, status: 'MOVING' as const, heading: 28 } : vehicle) : fleet

  return <div className={`operations-map ${compact ? 'operations-map--compact' : ''} ${executionMode ? 'operations-map--execution' : ''}`}>
    <div className="map-toolbar">
      <div className="map-toolbar__title"><MapPinned size={14} /><span>LƯỚI ĐIỀU PHỐI HÀ NỘI</span><span className={`map-live-dot ${forecastMode ? 'map-live-dot--forecast' : ''}`} /></div>
      <div className="map-toolbar__legend"><span><i className="legend-line legend-line--solid" /> HIỆN TẠI</span><span><i className="legend-line legend-line--dash" /> DỰ BÁO</span></div>
    </div>
    <svg aria-label="Bản đồ điều hành các zone Hà Nội" className="map-canvas" role="img" viewBox="0 0 580 450">
      <defs>
        <pattern height="8" id="shortageHatch" patternUnits="userSpaceOnUse" width="8" patternTransform="rotate(35)">
          <line stroke="#d03b3b" strokeOpacity=".32" strokeWidth="3" y2="8" />
        </pattern>
        <pattern height="14" id="forecastShade" patternUnits="userSpaceOnUse" width="14">
          <circle cx="2" cy="2" fill="#eea84b" fillOpacity=".25" r="1.5" />
        </pattern>
        <marker id="routeArrow" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="6" refY="3.5" viewBox="0 0 7 7">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#4ad0bd" />
        </marker>
      </defs>
      <rect className="map-water" height="450" width="580" x="0" y="0" />
      <path className="map-river" d="M510,-20 C452,75 501,122 454,195 C418,249 473,304 433,486" />
      <g className="map-roads">
        <path d="M18 102 C148 160 215 145 321 188 S480 275 563 337" />
        <path d="M22 260 C129 237 178 275 256 244 S413 123 558 112" />
        <path d="M122 20 C147 131 219 176 222 257 S237 362 325 438" />
        <path d="M385 21 C350 120 325 183 357 245 S420 348 502 424" />
        <path d="M48 390 C154 326 236 326 330 339 S461 363 557 403" />
      </g>
      {forecastMode && <ellipse className="forecast-overlay" cx="299" cy="234" rx="230" ry="188" />}
      {displayZones.map((zone) => <g className={`map-zone map-zone--${statusClass[zone.status]} ${selectedZoneId === zone.id ? 'is-selected' : ''}`} key={zone.id} onClick={() => onZoneSelect(zone.id)}>
        <polygon points={zone.points} />
        {showShortage && zone.status === 'SHORTAGE' && <polygon className="map-zone__hatch" points={zone.points} />}
        <circle className="map-zone__point" cx={zone.labelPosition.x} cy={zone.labelPosition.y} r={selectedZoneId === zone.id ? 6 : 4} />
        <text className="map-zone__label" x={zone.labelPosition.x + 9} y={zone.labelPosition.y + 4}>{zone.shortName} · {statusLabel[zone.status]}</text>
      </g>)}
      <g className="map-route-layer">
        <path className="map-route" d="M210 178 C259 204 285 248 303 296" markerEnd="url(#routeArrow)" />
        <path className="map-route" d="M380 96 C383 147 361 191 345 230" markerEnd="url(#routeArrow)" />
        <circle className="map-route__waypoint" cx="255" cy="215" r="4" /><circle className="map-route__waypoint" cx="286" cy="254" r="4" />
        <circle className="map-route__waypoint" cx="379" cy="154" r="4" /><circle className="map-route__waypoint" cx="362" cy="191" r="4" />
      </g>
      <g className="map-vehicle-layer">
        {visibleVehicles.map((vehicle) => <VehicleMarker key={vehicle.id} vehicle={vehicle} />)}
      </g>
      <g className="map-passenger-layer">
        <g className="passenger-marker" transform="translate(331 304)"><circle r="12" /><UsersRound size={12} x="-6" y="-6" /></g>
        <g className="passenger-marker passenger-marker--secondary" transform="translate(272 307)"><circle r="9" /><UsersRound size={10} x="-5" y="-5" /></g>
      </g>
      {showShortage && <g className="map-alert" transform="translate(319 274)">
        <path className="map-alert__pointer" d="M0 33 L9 43 L18 33" />
        <rect height="34" rx="7" width="162" x="-72" y="0" />
        <AlertTriangle size={14} x="-60" y="10" /><text x="-40" y="14">THIẾU XE</text><text className="map-alert__sub" x="-40" y="27">NHU CẦU KHÁCH · 344</text>
      </g>}
      {forecastMode && <g className="map-forecast-callout" transform="translate(403 364)"><rect height="25" rx="5" width="128" /><CircleDot size={11} x="10" y="7" /><text x="27" y="16">THIẾU DỰ BÁO · +{horizon}P</text></g>}
    </svg>
    <div className="map-status-bar">
      <span><i className="map-status-key map-status-key--green" /> Độ phủ nguồn xe <strong>78%</strong></span>
      <span><CarFront size={13} /> {executionMode ? '58 xe đang di chuyển' : `${network.supply.toLocaleString('vi-VN')} xe trực tuyến`}</span>
      <span><UsersRound size={13} /> {forecastMode ? `Nhu cầu dự báo ${network.demand.toLocaleString('vi-VN')}` : `Nhu cầu hiện tại ${network.demand.toLocaleString('vi-VN')}`}</span>
    </div>
    {!compact && <div className="map-context-note"><ArrowUpRight size={12} /> Chọn khu vực để phóng tới · vạch gạch = thiếu xe nghiêm trọng · tuyến đứt = điều chuyển</div>}
  </div>
}

function VehicleMarker({ vehicle }: { vehicle: Vehicle }) {
  const className = `vehicle-marker vehicle-marker--${vehicle.status.toLowerCase()}`
  return <g className={className} transform={`translate(${vehicle.x} ${vehicle.y}) rotate(${vehicle.heading ?? 0})`}>
    <circle className="vehicle-marker__halo" r="10" />
    <image className="vehicle-marker__car-image" href={carImageUrl} height="24" preserveAspectRatio="xMidYMid meet" width="24" x="-12" y="-12" />
    {vehicle.status === 'SHORTAGE' && <path className="vehicle-marker__cross" d="M-6 -6 L6 6 M6 -6 L-6 6" />}
  </g>
}
