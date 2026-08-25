import type { AgentStep, DispatchPlan, ExecutionEvent, ForecastHorizon, OperationsZone, Vehicle } from '../types'

export const FORECAST_HORIZONS = [
  { minutes: 0, label: 'NOW', context: 'LIVE' },
  { minutes: 10, label: '+10', context: 'FORECAST' },
  { minutes: 20, label: '+20', context: 'FORECAST' },
  { minutes: 30, label: '+30', context: 'FORECAST' },
] as const

export const operationsZones: OperationsZone[] = [
  { id: 'zone-a', name: 'Hoàn Kiếm', shortName: 'A', status: 'BALANCED', supply: 214, demand: 186, eta: 4.2, risk: 18, points: '123,125 260,92 339,152 304,248 177,264 102,210', labelPosition: { x: 206, y: 181 } },
  { id: 'zone-b', name: 'Ba Đình', shortName: 'B', status: 'WATCH', supply: 158, demand: 212, eta: 5.8, risk: 42, points: '94,72 210,40 286,73 260,111 123,125 59,112', labelPosition: { x: 166, y: 89 } },
  { id: 'zone-c', name: 'Đống Đa', shortName: 'C', status: 'ABNORMAL', supply: 122, demand: 278, eta: 8.4, risk: 68, points: '304,248 339,152 421,155 462,253 402,325 281,310', labelPosition: { x: 369, y: 243 } },
  { id: 'zone-d', name: 'Hai Bà Trưng', shortName: 'D', status: 'SHORTAGE', supply: 86, demand: 344, eta: 11.6, risk: 87, points: '177,264 304,248 281,310 318,384 192,420 131,344', labelPosition: { x: 226, y: 335 } },
  { id: 'zone-e', name: 'Tây Hồ', shortName: 'E', status: 'BALANCED', supply: 198, demand: 161, eta: 4.8, risk: 24, points: '286,73 392,36 491,72 421,155 339,152 260,111', labelPosition: { x: 371, y: 94 } },
  { id: 'zone-f', name: 'Cầu Giấy', shortName: 'F', status: 'WATCH', supply: 145, demand: 224, eta: 6.6, risk: 51, points: '59,112 123,125 177,264 102,288 28,221', labelPosition: { x: 89, y: 195 } },
  { id: 'zone-g', name: 'Long Biên', shortName: 'G', status: 'ABNORMAL', supply: 104, demand: 246, eta: 7.9, risk: 63, points: '491,72 553,105 542,225 462,253 421,155', labelPosition: { x: 489, y: 162 } },
  { id: 'zone-h', name: 'Thanh Xuân', shortName: 'H', status: 'BALANCED', supply: 172, demand: 155, eta: 4.4, risk: 22, points: '102,288 177,264 131,344 192,420 86,401 45,331', labelPosition: { x: 108, y: 348 } },
]

const forecastDemandFactor: Record<ForecastHorizon, number> = { 0: 1, 10: 1.06, 20: 1.14, 30: 1.2 }
const forecastSupplyFactor: Record<ForecastHorizon, number> = { 0: 1, 10: 0.99, 20: 0.96, 30: 0.93 }

export function operationsNetworkAtHorizon(horizon: ForecastHorizon) {
  return {
    demand: Math.round(2213 * forecastDemandFactor[horizon]),
    supply: Math.round(1248 * forecastSupplyFactor[horizon]),
    eta: Number((6.8 * (1 + horizon / 180)).toFixed(1)),
  }
}

export function operationsZonesAtHorizon(horizon: ForecastHorizon) {
  return operationsZones.map((zone) => {
    const demand = Math.round(zone.demand * forecastDemandFactor[horizon])
    const supply = Math.round(zone.supply * forecastSupplyFactor[horizon])
    const risk = Math.min(98, Math.round(zone.risk + (horizon / 30) * 8))
    const status = zone.status === 'SHORTAGE'
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
      eta: Number((zone.eta * (1 + horizon / 180)).toFixed(1)),
      risk,
      status,
    } satisfies OperationsZone
  })
}

export const fleet: Vehicle[] = [
  { id: 'EV-104', x: 183, y: 152, status: 'NORMAL' },
  { id: 'EV-217', x: 236, y: 112, status: 'NORMAL' },
  { id: 'EV-308', x: 356, y: 197, status: 'SHORTAGE' },
  { id: 'EV-412', x: 254, y: 300, status: 'MOVING', heading: 30 },
  { id: 'EV-526', x: 435, y: 113, status: 'NORMAL' },
  { id: 'EV-633', x: 154, y: 330, status: 'MOVING', heading: -44 },
  { id: 'EV-745', x: 481, y: 208, status: 'SHORTAGE' },
  { id: 'EV-812', x: 74, y: 175, status: 'NORMAL' },
  { id: 'EV-927', x: 296, y: 207, status: 'MOVING', heading: 75 },
]

export const demandTrend = [
  { time: '00', value: 620 }, { time: '04', value: 410 }, { time: '08', value: 1240 }, { time: '12', value: 980 },
  { time: '16', value: 1680 }, { time: '20', value: 2210 }, { time: '24', value: 1760 },
]

export const etaTrend = [
  { time: '00', value: 4.1 }, { time: '04', value: 3.7 }, { time: '08', value: 5.2 }, { time: '12', value: 4.8 },
  { time: '16', value: 6.1 }, { time: '20', value: 8.3 }, { time: '24', value: 7.2 },
]

export const zoneBalanceData = operationsZones
  .slice()
  .sort((a, b) => b.risk - a.risk)
  .slice(0, 6)
  .map((zone) => ({ zone: zone.shortName, demand: zone.demand, supply: zone.supply }))

export function operationsDemandTrendAtHorizon(horizon: ForecastHorizon) {
  const factor = forecastDemandFactor[horizon]
  return demandTrend.map((point) => ({ ...point, value: Math.round(point.value * factor) }))
}

export function operationsEtaTrendAtHorizon(horizon: ForecastHorizon) {
  const factor = 1 + horizon / 180
  return etaTrend.map((point) => ({ ...point, value: Number((point.value * factor).toFixed(1)) }))
}

export function operationsZoneBalanceAtHorizon(horizon: ForecastHorizon) {
  return operationsZonesAtHorizon(horizon)
    .slice()
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 6)
    .map((zone) => ({ zone: zone.shortName, demand: zone.demand, supply: zone.supply }))
}

export const agents: AgentStep[] = [
  { id: 'forecast', name: 'Forecast Agent', state: 'DONE', output: 'Demand spike detected in 3 zones', detail: 'Confidence 94% · horizon +30 min' },
  { id: 'traffic', name: 'Traffic Agent', state: 'DONE', output: 'Rain impact: +15% travel time', detail: '3 congestion corridors identified' },
  { id: 'supply', name: 'Supply Agent', state: 'WARNING', output: 'Available supply is insufficient', detail: 'Zone D gap: 258 vehicles' },
  { id: 'dispatch', name: 'Dispatch Agent', state: 'RUNNING', output: 'Evaluating relocation actions', detail: '12 candidate moves · 2 selected', progress: 62 },
  { id: 'optimization', name: 'Optimization Agent', state: 'PENDING', output: 'Waiting for dispatch constraints', detail: 'Will compare 3 response plans' },
]

const baseReasons = [
  { id: 'demand-spike', label: 'High demand spike', detail: 'Zone D demand is 3.2× the last 30 minute baseline.', severity: 'CRITICAL' as const },
  { id: 'rain', label: 'Approaching rain', detail: 'Weather model expects a +15% travel-time impact.', severity: 'HIGH' as const },
  { id: 'supply-gap', label: 'Nearby supply is insufficient', detail: 'Adjacent zones cannot cover the projected shortage alone.', severity: 'HIGH' as const },
]

export const dispatchPlans: DispatchPlan[] = [
  {
    id: 'plan-a', label: 'PLAN A', version: 1, isRecommended: false, vehicles: 45, etaImprovement: 2.6, cost: 'LOW', relocationDistance: 18.4, coverage: 74, aiConfidence: 86, serviceRiskReduction: 18,
    reasons: baseReasons, actions: [
      { id: 'a-1', quantity: 24, sourceZoneId: 'zone-a', targetZoneId: 'zone-d', etaImpact: '-1.2 min', selected: true },
      { id: 'a-2', quantity: 21, sourceZoneId: 'zone-e', targetZoneId: 'zone-c', etaImpact: '-0.8 min', selected: false },
    ],
  },
  {
    id: 'plan-b', label: 'PLAN B', version: 1, isRecommended: true, vehicles: 58, etaImprovement: 4.1, cost: 'MEDIUM', relocationDistance: 24.6, coverage: 91, aiConfidence: 94, serviceRiskReduction: 31,
    reasons: baseReasons, actions: [
      { id: 'b-1', quantity: 32, sourceZoneId: 'zone-a', targetZoneId: 'zone-d', etaImpact: '-2.0 min', selected: true },
      { id: 'b-2', quantity: 18, sourceZoneId: 'zone-e', targetZoneId: 'zone-c', etaImpact: '-1.1 min', selected: true },
      { id: 'b-3', quantity: 8, sourceZoneId: 'zone-f', targetZoneId: 'zone-d', etaImpact: '-0.6 min', selected: false },
    ],
  },
  {
    id: 'plan-c', label: 'PLAN C', version: 1, isRecommended: false, vehicles: 72, etaImprovement: 4.8, cost: 'HIGH', relocationDistance: 37.2, coverage: 95, aiConfidence: 79, serviceRiskReduction: 34,
    reasons: baseReasons, actions: [
      { id: 'c-1', quantity: 44, sourceZoneId: 'zone-a', targetZoneId: 'zone-d', etaImpact: '-2.5 min', selected: false },
      { id: 'c-2', quantity: 28, sourceZoneId: 'zone-g', targetZoneId: 'zone-c', etaImpact: '-1.8 min', selected: false },
    ],
  },
]

export const executionEvents: ExecutionEvent[] = [
  { time: '18:42:06', event: 'Vehicle relocation started', zone: 'Zone D', status: 'IN PROGRESS', detail: '32 vehicles dispatched' },
  { time: '18:41:52', event: 'Plan B approved by operator', zone: 'Network', status: 'COMPLETED', detail: 'Human approval recorded' },
  { time: '18:41:11', event: 'Adaptive routing activated', zone: 'Zone A → D', status: 'COMPLETED', detail: 'Route set RV-204' },
  { time: '18:40:48', event: 'Weather signal ingested', zone: 'Network', status: 'SIGNAL', detail: '+15% travel time impact' },
]

export const updatedPlan = {
  id: 'plan-b-v2',
  label: 'PLAN V2',
  vehicles: 64,
  etaImprovement: 4.6,
  serviceRiskReduction: 39,
  coverage: 96,
  reason: 'Demand forecast increased in Zone D while nearby supply tightened.',
}

export const zoneById = Object.fromEntries(operationsZones.map((zone) => [zone.id, zone])) as Record<string, OperationsZone>
