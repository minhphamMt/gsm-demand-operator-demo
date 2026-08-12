export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'
export type ProposalStatus = 'Generated' | 'UnderReview' | 'Revised' | 'Approved' | 'Rejected' | 'Stale' | 'FailedGeneration'
export type CampaignStatus = 'Draft' | 'Active' | 'TargetReached' | 'Completed' | 'Cancelled' | 'BudgetExhausted' | 'Running' | 'Expired' | 'Closed'
export type Scenario = 'baseline' | 'plan' | 'activation'
export type DemoScenarioId = 'normal' | 'rain-peak' | 'holiday'
export type ResponseMode = 'human' | 'simulated' | 'mixed'
export type DriverStatus = 'offline' | 'online_idle' | 'online_busy' | 'en_route' | 'activated' | 'on_trip'
export type OfferStatus = 'Open' | 'Accepted' | 'Declined' | 'Expired' | 'Cancelled'

export type Zone = { id: string; aiZoneId: number; zoneCode: string; label: string; tier: string; areaKm2: number; center: [longitude: number, latitude: number]; boundary: [longitude: number, latitude: number][]; dataStatus: 'live' | 'missing'; supply: number; demand: number; gap: number; operationalGap?: number; severity: Severity | string; confidence: number | null; rainMmH: number; rainForecast15: number; rainForecast30: number; forecast5?: number; forecast15: number; forecast30: number; forecastSupply5?: number; forecastSupply15?: number; forecastSupply30?: number; demandRange15?: readonly [number, number] | null; demandRange30?: readonly [number, number] | null; supplyRange15?: readonly [number, number] | null; supplyRange30?: readonly [number, number] | null }
export type Hotspot = { zoneId: string; rank: number; reason: string; etaMinutes: number; isPersistent: boolean }
export type AiSnapshotStatus = { zoneContract: 'AI_ZONE_1_30'; registeredZones: number; liveZones: number; forecastedZones: number; horizons: readonly number[]; modelVersion: string | null; forecastMode: string | null; dataSource: string | null; forecastAt: string | null }
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
  rank: number
  scenarioId: DemoScenarioId
  generatorType: 'MOCK' | 'RULE_BASED' | 'AGENT' | 'MANUAL'
  generatorVersion: string
  forecastMode?: string | null
  dataSource?: string | null
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

export type RevisePlanRequest = {
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

export type RejectPlanRequest = { reasonCode: 'budget' | 'source-risk' | 'low-impact' | 'stale-data' | 'other'; note: string }

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

export type AuditAction = 'Created' | 'Revised' | 'Approved' | 'Rejected' | 'ActivationStarted' | 'CampaignCancelled' | 'CampaignTargetReached' | 'OfferAccepted' | 'OfferDeclined' | 'OfferExpired' | 'ScenarioLoaded' | 'DemoReset'
export type AuditEntry = { id: string; planId: string; entityType?: string; entityId?: string; action: AuditAction; actor: string; actorType?: string; actorId?: string | null; occurredAt: string; detail: string }
export type AuditFilters = { page: number; pageSize: number; entityId?: string; entityType?: string; action?: AuditAction; actorType?: string; actorId?: string; from?: string; to?: string }
export type AuditPage = { items: readonly AuditEntry[]; page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean }
export type OperationsReportFilters = { campaignId?: string; from?: string; to?: string }
export type OperationsCampaignReport = { id: string; status: string; startedAt: string; completedAt: string | null; activatedDrivers: number; qualifiedTrips: number; rewardQualifiedVnd: number; rewardPaidVnd: number; budgetUsedVnd: number; budgetLimitVnd: number; rewardBudgetDeltaVnd: number; netCostVnd: null; auditEvents: number }
export type OperationsReport = {
  generatedAt: string
  dataMode: 'DB_LEDGER' | 'SIMULATED'
  summary: { campaigns: number; activatedDrivers: number; qualifiedTrips: number; rewardQualifiedVnd: number; rewardPaidVnd: number; budgetUsedVnd: number; rewardBudgetDeltaVnd: number; auditEvents: number; netCostVnd: null }
  campaigns: readonly OperationsCampaignReport[]
  sources: { activatedDrivers: string; qualifiedTrips: string; rewardQualifiedVnd: string; rewardPaidVnd: string; budgetUsedVnd: string; auditEvents: string; netCostVnd: null }
}
export type DriverView = { driver: DemoDriver; activeOffers: readonly Offer[]; acceptedOffers: readonly Offer[]; history: readonly Offer[] }

export type OperatorDataAdapter = {
  generateAiDecision: (snapshotId: number, horizonMinutes: 15 | 30) => Promise<Snapshot>
  optimizeAiDecision: (snapshotId: number, horizonMinutes: 5 | 15 | 30) => Promise<Proposal>
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
  approvePlan: (planId: string, note?: string) => Promise<Proposal>
  rejectPlan: (planId: string, request: RejectPlanRequest) => Promise<Proposal>
  startCampaign: (planId: string, mode?: ResponseMode) => Promise<Campaign>
  cancelCampaign: (campaignId: string) => Promise<Campaign>
  getDriverView: (driverId: string) => Promise<DriverView | undefined>
  listDrivers: () => Promise<readonly DemoDriver[]>
  setDriverStatus: (driverId: string, status: 'offline' | 'online_idle') => Promise<DemoDriver>
  respondToOffer: (offerId: string, response: 'Accepted' | 'Declined') => Promise<Offer>
  expireOffer: (offerId: string) => Promise<Offer>
}
