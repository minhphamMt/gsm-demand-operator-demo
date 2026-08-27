import type { LlmHealth } from '@/features/operator-pipeline/model/llmHealth'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'
export type ProposalStatus = 'Generated' | 'UnderReview' | 'Revised' | 'Approved' | 'Rejected' | 'Stale' | 'FailedGeneration'
export type PlanMode = 'RELOCATION' | 'ACTIVATION_ONLY' | 'HYBRID'
export type CampaignStatus = 'Draft' | 'Scheduled' | 'Active' | 'Paused' | 'TargetReached' | 'Completed' | 'Cancelled' | 'BudgetExhausted' | 'Running' | 'Expired' | 'Settling' | 'Settled' | 'Closed'
export type Scenario = 'baseline' | 'plan' | 'activation'
export type DemoScenarioId = 'normal' | 'rain-peak' | 'holiday'
export type ResponseMode = 'human' | 'simulated' | 'mixed'
export type DriverStatus = 'offline' | 'online_idle' | 'online_busy' | 'en_route' | 'activated' | 'on_trip'
export type OfferStatus = 'Open' | 'Accepted' | 'Declined' | 'Expired' | 'Cancelled'
export type ForecastHorizon = 5 | 10 | 15

export type Zone = { id: string; aiZoneId: number; zoneCode: string; label: string; tier: string; areaKm2: number; center: [longitude: number, latitude: number]; boundary: [longitude: number, latitude: number][]; dataStatus: 'live' | 'missing'; supply: number | null; demand: number | null; gap: number | null; operationalGap?: number; severity: Severity | string; confidence: number | null; confidence5?: number | null; confidence10?: number | null; confidence15?: number | null; confidence30?: number | null; rainMmH: number; rainForecast15: number; rainForecast30: number; forecast5?: number; forecast10?: number; forecast15: number; forecast30: number; forecastSupply5?: number; forecastSupply10?: number; forecastSupply15?: number; forecastSupply30?: number; demandRange5?: readonly [number, number] | null; demandRange10?: readonly [number, number] | null; demandRange15?: readonly [number, number] | null; demandRange30?: readonly [number, number] | null; supplyRange5?: readonly [number, number] | null; supplyRange10?: readonly [number, number] | null; supplyRange15?: readonly [number, number] | null; supplyRange30?: readonly [number, number] | null }
export type Hotspot = { zoneId: string; rank: number; reason: string; etaMinutes: number; isPersistent: boolean; forecastRunId?: string; severity?: Severity; policyVersion?: string; reasonCodes?: readonly string[]; threshold?: number; contributingFeatures?: { demand: number; supply: number; gap: number } }
export type ForecastRunStatus = 'COMPLETED' | 'FALLBACK' | 'FAILED' | 'RUNNING' | 'SUPERSEDED'
export type ForecastRun = { id: string; horizonMinutes: ForecastHorizon; status: ForecastRunStatus | null; modelVersion: string | null; featureVersion: string | null; policyVersion: string | null; inputHash: string | null; forecastMode: string | null; dataSource: string | null; forecastAt: string | null; completedAt: string | null; zoneCount: number }
export type AiSnapshotStatus = { zoneContract: 'AI_ZONE_1_30'; registeredZones: number; liveZones: number; forecastedZones: number; horizons: readonly number[]; forecastRuns?: readonly ForecastRun[]; modelVersion: string | null; forecastMode: string | null; dataSource: string | null; forecastAt: string | null; forecastRunId?: string | null; forecastStatus?: ForecastRunStatus | null }
export type ReplayTimelineStep = { sourceAt: string; meanRainMmH: number }
export type Snapshot = { generatedAt: string; sourceAt?: string; replayStep: string; scenario: Scenario; demoScenarioId: DemoScenarioId; regime: 'normal' | 'peak' | 'rain' | 'rain_peak'; ai?: AiSnapshotStatus; zones: readonly Zone[]; hotspots: readonly Hotspot[]; kpis: { fleetAvailable: number; requests: number; fulfillmentRate: number; residualGap: number; avgWaitProxy: number } }
export type DemoScenario = { id: DemoScenarioId; label: string; description: string; regime: Snapshot['regime']; startTime: string; replaySteps: number; responseMode: ResponseMode }
export type Baseline = { id: 'no-action' | 'historical-average'; label: string; fulfillmentRate: number; residualGap: number; avgWaitProxy: number; frozenAt: string; source: string }

export type Move = { id: string; sourceZoneId: string; sourceZoneLabel: string; targetZoneId: string; targetZoneLabel: string; quantity: number; distanceKm: number; etaMinutes: number; estimatedCost: number; sourceSupplyAfter: number }
export type CandidateSourceZone = { zoneId: string; label: string; availableSupply: number; distanceKm: number; etaMinutes: number }
export type PolicyCheck = { id: string; label: string; passed: boolean; blocking: boolean; detail: string }
export type SimulationMetrics = { fulfillmentRate: number; residualGap: number; deadheadKm: number; budget: number; expectedTrips: number; avgWaitProxy: number }
export type ProposalWarning = { id: string; severity: 'info' | 'warning' | 'critical'; title: string; detail: string }
export type Proposal = {
  id: string
  rootProposalId: string
  parentProposalId: string | null
  title: string
  status: ProposalStatus
  createdAt: string
  version: number
  contentHash?: string
  approvedContentHash?: string | null
  approvedVersion?: number | null
  rank: number
  scenarioId: DemoScenarioId
  generatorType: 'MOCK' | 'RULE_BASED' | 'AGENT' | 'MANUAL'
  generatorVersion: string
  planMode?: PlanMode
  forecastMode?: string | null
  dataSource?: string | null
  forecastRunId?: string | null
  modelInputId?: string | null
  inputSnapshotId: string
  hotspotId: string
  targetZoneId: string | null
  targetZoneIds?: readonly (string | number)[]
  targetZoneLabel: string
  confidence: number | null
  simulationAvailable: boolean
  candidateSourceZones: readonly CandidateSourceZone[]
  moves: readonly Move[]
  targetDriverCount: number
  expectedOfferCount: number
  eligibleDriverCount: number
  averageDistanceKm: number
  averageEtaMinutes: number
  campaignDurationMinutes: number
  relocationBonus: number
  zoneTripBonus: number
  fareMultiplier: number
  budgetLimit: number
  activationBudgetLimit?: number
  activationTtlMinutes?: number
  estimatedRewardCost: number
  estimatedAdditionalRevenue: number
  estimatedNetCost: number
  policyChecks: readonly PolicyCheck[]
  warnings: readonly ProposalWarning[]
  metricsBefore: SimulationMetrics
  metrics: SimulationMetrics
  metricsAfterRelocation?: SimulationMetrics
  metricsAfterActivation?: SimulationMetrics
  explanation: readonly string[]
  inputFreshUntil: string
}

export type OptimizationResult =
  | { planningStatus: 'proposal_created'; proposal: Proposal }
  | { planningStatus: 'not_required'; reasonCode: string }

export type RevisePlanRequest = {
  expectedVersion: number
  moveQuantities: Readonly<Record<string, number>>
  moveSourceZoneIds: Readonly<Record<string, string>>
  targetDriverCount: number
  campaignDurationMinutes: number
  relocationBonus: number
  zoneTripBonus: number
  fareMultiplier: number
  budgetLimit: number
  note: string
}

export type RejectPlanRequest = { expectedVersion: number; reasonCode: 'budget' | 'source-risk' | 'low-impact' | 'stale-data' | 'other'; note: string }

export type DemoDriver = { id: string; name: string; status: DriverStatus; homeZoneId: string; distanceKm: number; shiftEndsInMinutes: number; acceptedOfferIds: readonly string[]; rewardTotal: number }
export type Offer = { id: string; campaignId: string; driverId: string; targetZoneId: string; reasonText: string; incentiveAmount: number; distanceKm: number; etaMinutes: number; expiresAt: string; status: OfferStatus; responseSource?: 'human' | 'simulated'; respondedAt?: string }
export type Campaign = {
  id: string
  planId: string
  status: CampaignStatus
  targetZoneId: string
  candidateCount: number
  offersSent: number
  viewed: number
  accepted: number
  declined: number
  expired: number
  cancelled: number
  enRoute: number
  arrivedVerified: number
  unitsGained: number
  qualifiedTrips: number
  incentiveBudget: number
  budgetLimit: number
  worstCaseCommitment: number
  startedAt: string
  expiresAt: string
  responseMode: ResponseMode
  suggestedActivation: number
}

export type AuditAction = 'Created' | 'Revised' | 'Approved' | 'ProposalExpired' | 'ProposalCancelled' | 'Rejected' | 'ActivationStarted' | 'CampaignCancelled' | 'CampaignTargetReached' | 'OfferAccepted' | 'OfferDeclined' | 'OfferExpired' | 'DispatchReleased' | 'DispatchEventRecorded' | 'DispatchRetryRequested' | 'DispatchCancelled' | 'ScenarioLoaded' | 'DemoReset'
export type AuditEntry = { id: string; planId: string; entityType?: string; entityId?: string; action: AuditAction; actor: string; actorType?: string; actorId?: string | null; requestId?: string | null; correlationId?: string | null; entityVersion?: number | null; entityHash?: string | null; occurredAt: string; detail: string }
export type AuditFilters = { page: number; pageSize: number; entityId?: string; entityType?: string; action?: AuditAction; actorType?: string; actorId?: string; from?: string; to?: string }
export type AuditPage = { items: readonly AuditEntry[]; page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean; nextCursor?: string | null }
export type OperationsReportFilters = { campaignId?: string; from?: string; to?: string }
export type BudgetLifecycleMetrics = { reservedVnd: number; committedVnd: number; qualifiedVnd: number; paidVnd: number; compensationDueVnd: number; releasedVnd: number }
export type OperationsCampaignReport = BudgetLifecycleMetrics & { id: string; status: string; startedAt: string; completedAt: string | null; activatedDrivers: number; qualifiedTrips: number; rewardQualifiedVnd: number; rewardPaidVnd: number; budgetUsedVnd: number; budgetLimitVnd: number; rewardBudgetDeltaVnd: number; netCostVnd: null; auditEvents: number }
export type OperationsReport = {
  generatedAt: string
  dataMode: 'DB_LEDGER' | 'SIMULATED'
  summary: BudgetLifecycleMetrics & { campaigns: number; activatedDrivers: number; qualifiedTrips: number; rewardQualifiedVnd: number; rewardPaidVnd: number; budgetUsedVnd: number; rewardBudgetDeltaVnd: number; auditEvents: number; netCostVnd: null }
  campaigns: readonly OperationsCampaignReport[]
  sources: { activatedDrivers: string; qualifiedTrips: string; rewardQualifiedVnd: string; rewardPaidVnd: string; budgetUsedVnd: string; budgetLifecycle: string; auditEvents: string; netCostVnd: null }
}
export type DriverView = { driver: DemoDriver; activeOffers: readonly Offer[]; acceptedOffers: readonly Offer[]; history: readonly Offer[] }

export type CapabilityState = { available: boolean; enabled: boolean; reason?: string; values?: readonly number[] }
export type OperatorCapabilities = {
  serverTime: string
  timezone: 'Asia/Ho_Chi_Minh'
  health?: { api: string; database: string; ai: string; map: string }
  capabilities: {
    forecastHorizons: CapabilityState
    proposalReview: CapabilityState
    dispatchRelease: CapabilityState
    dispatchReconciliation: CapabilityState
    activationRelease: CapabilityState
    compensationSettlement: CapabilityState
    scenarioComparison: CapabilityState
  }
}
export type DispatchMove = { id: string; sourceMoveKey: string; sourceZoneId: number; targetZoneId: number; plannedUnits: number; acknowledgedUnits: number; arrivedUnits: number; availableUnits: number; failedUnits: number; state: 'PLANNED' | 'SENT' | 'ACKNOWLEDGED' | 'EN_ROUTE' | 'ARRIVED' | 'AVAILABLE' | 'FAILED' | 'CANCELLED'; routeSource?: string | null; etaMinutes: number; distanceKm: number }
export type Reconciliation = { id: string; revision: number; plannedUnits: number; acknowledgedUnits: number; arrivedUnits: number; availableUnits: number; failedUnits: number; actualContribution: number; residualGap: number | null; isSnapshotFresh: boolean; createdAt: string }
export type DispatchBatch = { id: string; proposalId: string; proposalVersion: number; approvedContentHash: string; status: string; releasedAt: string; requestId?: string | null; moves: readonly DispatchMove[]; reconciliations: readonly Reconciliation[] }
export type ForecastEvaluation = {
  status: 'PENDING_GROUND_TRUTH' | 'OBSERVED'
  targetAt: string | null
  evaluatedZones: number
  demandMae?: number
  supplyMae?: number
  demandMape?: number
  demandIntervalCoverage?: number
  supplyIntervalCoverage?: number
  forecastFulfillmentRate?: number
  observedFulfillmentRate?: number
  fulfillmentRateError?: number
  forecastResidualGap?: number
  observedResidualGap?: number
}
export type ScenarioComparison = { id: string; commonInputHash: string; snapshotId: string; forecastRunId: string; modelVersion: string; policyVersion: string; scenarios: readonly { type: 'NO_ACTION' | 'RELOCATION' | 'ACTIVATION' | 'HYBRID'; estimatedMetrics: Record<string, unknown>; observedMetrics: Record<string, unknown> | null; uncertainty: Record<string, unknown>; responseSource: string }[]; forecastEvaluation?: ForecastEvaluation; hasObservedRevenue: false; revenueNotice: string }
export type PersistentNotification = { id: string; ownerId: string | null; severity: 'INFO' | 'WARNING' | 'CRITICAL'; category: string; title: string; message: string; entityType: string | null; entityId: string | null; requestId: string | null; status: 'UNREAD' | 'READ' | 'ACKNOWLEDGED' | 'RESOLVED'; escalateAt: string | null; createdAt: string }

export type OperatorDataAdapter = {
  getCapabilities: () => Promise<OperatorCapabilities>
  generateAiDecision: (snapshotId: number, horizonMinutes: ForecastHorizon) => Promise<Snapshot>
  optimizeAiDecision: (snapshotId: number, horizonMinutes: ForecastHorizon) => Promise<OptimizationResult>
  runReplayStep: (sourceAt: string) => Promise<Snapshot>
  getReplayWindow: (sourceAt: string) => Promise<readonly ReplayTimelineStep[]>
  getSnapshot: (scenario: Scenario, demoScenarioId?: DemoScenarioId, replayIndex?: number) => Promise<Snapshot>
  listScenarios: () => Promise<readonly DemoScenario[]>
  getBaselines: () => Promise<readonly Baseline[]>
  getOperationsReport: (filters: OperationsReportFilters) => Promise<OperationsReport>
  loadScenario: (scenarioId: DemoScenarioId) => Promise<void>
  resetDemo: () => Promise<void>
  listPlans: () => Promise<readonly Proposal[]>
  getPlan: (planId: string) => Promise<Proposal | undefined>
  listCampaigns: () => Promise<readonly Campaign[]>
  listOffers: (campaignId?: string) => Promise<readonly Offer[]>
  listAudit: () => Promise<readonly AuditEntry[]>
  queryAudit: (filters: AuditFilters) => Promise<AuditPage>
  revisePlan: (planId: string, request: RevisePlanRequest) => Promise<Proposal>
  approvePlan: (planId: string, expectedVersion: number, note?: string) => Promise<Proposal>
  rejectPlan: (planId: string, request: RejectPlanRequest) => Promise<Proposal>
  cancelApprovedPlan: (planId: string, reason: string) => Promise<Proposal>
  startCampaign: (planId: string, mode?: ResponseMode) => Promise<Campaign>
  cancelCampaign: (campaignId: string) => Promise<Campaign>
  getDriverView: (driverId: string) => Promise<DriverView | undefined>
  listDrivers: () => Promise<readonly DemoDriver[]>
  setDriverStatus: (driverId: string, status: 'offline' | 'online_idle') => Promise<DemoDriver>
  respondToOffer: (offerId: string, response: 'Accepted' | 'Declined') => Promise<Offer>
  expireOffer: (offerId: string) => Promise<Offer>
  listDispatch: () => Promise<readonly DispatchBatch[]>
  releaseDispatch: (planId: string) => Promise<DispatchBatch>
  cancelDispatch: (batchId: string, reason: string) => Promise<DispatchBatch>
  retryDispatchMove: (batchId: string, moveId: string, reason: string) => Promise<DispatchBatch>
  compareScenarios: (planId: string) => Promise<ScenarioComparison>
  listNotifications: () => Promise<readonly PersistentNotification[]>
  acknowledgeNotification: (notificationId: string) => Promise<PersistentNotification>
  acknowledgeAllNotifications: () => Promise<readonly PersistentNotification[]>
  startPipelineRun: (horizonMinutes: ForecastHorizon, snapshotId?: number) => Promise<{ runId: string; status: string }>
  getPipelineRun: (runId: string) => Promise<PipelineRunRecord>
  getLlmHealth: () => Promise<LlmHealth>
}
