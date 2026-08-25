export type ZoneStatus = 'BALANCED' | 'WATCH' | 'ABNORMAL' | 'SHORTAGE'

export type ForecastHorizon = 0 | 10 | 20 | 30

export type ActiveScreen = 'wall' | 'map' | 'pipeline' | 'plans' | 'review' | 'execution'

export type FlowStage =
  | 'NORMAL'
  | 'DEMAND_WARNING'
  | 'FORECAST'
  | 'ANALYZING'
  | 'PLAN_READY'
  | 'PLAN_REVIEW'
  | 'DISPATCHING'
  | 'EXECUTING'
  | 'NEW_DATA'
  | 'REPLAN_READY'
  | 'UPDATE_APPROVED'

export type AgentState = 'PENDING' | 'RUNNING' | 'DONE' | 'WARNING' | 'FAILED'

export type PlanCost = 'LOW' | 'MEDIUM' | 'HIGH'

export type PlanAction = {
  id: string
  quantity: number
  sourceZoneId: string
  targetZoneId: string
  etaImpact: string
  selected: boolean
}

export type PlanReason = {
  id: string
  label: string
  detail: string
  severity: 'WATCH' | 'HIGH' | 'CRITICAL'
}

export type DispatchPlan = {
  id: string
  label: 'PLAN A' | 'PLAN B' | 'PLAN C'
  version: number
  isRecommended: boolean
  vehicles: number
  etaImprovement: number
  cost: PlanCost
  relocationDistance: number
  coverage: number
  aiConfidence: number
  serviceRiskReduction: number
  reasons: PlanReason[]
  actions: PlanAction[]
}

export type OperationsZone = {
  id: string
  name: string
  shortName: string
  status: ZoneStatus
  supply: number
  demand: number
  eta: number
  risk: number
  points: string
  labelPosition: { x: number; y: number }
}

export type Vehicle = {
  id: string
  x: number
  y: number
  status: 'NORMAL' | 'MOVING' | 'SHORTAGE'
  heading?: number
}

export type AgentStep = {
  id: string
  name: string
  state: AgentState
  output: string
  detail: string
  progress?: number
}

export type ExecutionEvent = {
  time: string
  event: string
  zone: string
  status: 'IN PROGRESS' | 'COMPLETED' | 'SIGNAL'
  detail: string
}

export type RejectReason = 'Cost too high' | 'Too many vehicles moved' | 'ETA benefit too low' | 'Operational concern' | 'Other'
