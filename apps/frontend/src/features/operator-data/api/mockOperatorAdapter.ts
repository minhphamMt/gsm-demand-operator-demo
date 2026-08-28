import { requestLocal } from '@/shared/api/client'
import { createAgentPlans, reviseAgentPlan } from '@/features/operator-data/model/mockProposalEngine'
import { simulateSnapshot } from '@/features/operator-data/model/mockSnapshotEngine'
import { isPlanInputFresh } from '@/features/operator-data/model/proposalRules'
import { createSeededOperatorState } from '@/features/operator-data/model/seedOperatorState'
import { eligibleDriversFor, refreshStaleProposalQueue, withLiveEligibility } from '@/features/operator-data/model/proposalWorkflowState'
import { createZones } from '@/features/operator-data/model/zoneGeometry'
import type { PipelineRunRecord, RunEvent } from '@/features/operator-pipeline/model/pipelineRun'
import type { AuditEntry, AuditFilters, AuditPage, Baseline, Campaign, DemoDriver, DemoScenario, DemoScenarioId, DispatchBatch, DriverView, Offer, OperationsReport, OperationsReportFilters, OperatorDataAdapter, PersistentNotification, Proposal, ScenarioComparison, Snapshot } from '@/features/operator-data/model/types'

const baseZones = createZones()
const scenarios: readonly DemoScenario[] = [
  { id: 'normal', label: 'Ngày thường 09:30', description: 'Cầu ổn định trong giờ bình thường.', regime: 'normal', startTime: '2026-08-05T09:00:00+07:00', replaySteps: 288, responseMode: 'mixed' },
  { id: 'rain-peak', label: 'Mưa đột ngột 17:00', description: 'Kịch bản demo chính: mưa giờ cao điểm chiều.', regime: 'rain_peak', startTime: '2026-08-05T17:00:00+07:00', replaySteps: 288, responseMode: 'mixed' },
  { id: 'holiday', label: 'Lễ hội cuối tuần', description: 'Cầu tập trung quanh trung tâm thành phố.', regime: 'peak', startTime: '2026-08-09T18:00:00+07:00', replaySteps: 288, responseMode: 'simulated' },
]
const baselines: readonly Baseline[] = [{ id: 'no-action', label: 'Không điều phối (đã khóa)', fulfillmentRate: 88.4, residualGap: 66, avgWaitProxy: 7.8, frozenAt: '2026-08-03T18:00:00+07:00', source: 'simulate(moves=[], activation=false)' }, { id: 'historical-average', label: 'Trung bình lịch sử (đã khóa)', fulfillmentRate: 89.6, residualGap: 59, avgWaitProxy: 7.2, frozenAt: '2026-08-03T18:00:00+07:00', source: 'zone × hour × day_of_week' }]
const clone = <T,>(value: T): T => structuredClone(value)
type State = { scenarioId: DemoScenarioId; nextProposalNumber: number; plans: Proposal[]; campaigns: Campaign[]; offers: Offer[]; drivers: DemoDriver[]; audit: AuditEntry[] }
const initialState = (): State => createSeededOperatorState()
const scenarioState = (scenarioId: DemoScenarioId): State => { const plans = createAgentPlans(scenarioId); const seeded = createSeededOperatorState(); const availableStatuses: readonly DemoDriver['status'][] = ['online_idle', 'offline', 'online_idle', 'offline', 'online_busy', 'offline', 'online_idle', 'offline']; return { ...seeded, scenarioId, plans, campaigns: [], offers: [], drivers: seeded.drivers.map((driver, index) => ({ ...driver, status: availableStatuses[index] ?? 'offline', acceptedOfferIds: [], rewardTotal: 0 })), audit: plans.map((plan, index) => ({ id: `AUD-00${index + 1}`, planId: plan.id, action: 'Created', actor: 'GSM-14 Agent', occurredAt: new Date().toISOString(), detail: `Agent sinh phương án ${index + 1}/3 từ snapshot ${plan.inputSnapshotId}.` })) } }
let state = initialState()
let dispatches: DispatchBatch[] = []
let notifications: PersistentNotification[] = []
const audit = (planId: string, action: AuditEntry['action'], actor: string, detail: string) => { state = { ...state, audit: [{ id: `AUD-${state.audit.length + 1}`, planId, action, actor, occurredAt: new Date().toISOString(), detail }, ...state.audit] } }
const planFor = (id: string) => state.plans.find((plan) => plan.id === id)
const refreshStaleProposals = () => { state = refreshStaleProposalQueue(state) }
const refreshCampaign = (campaignId: string) => {
  const offers = state.offers.filter((offer) => offer.campaignId === campaignId)
  const campaign = state.campaigns.find((item) => item.id === campaignId)
  if (!campaign) return
  const count = (status: Offer['status']) => offers.filter((offer) => offer.status === status).length
  const accepted = count('Accepted')
  const status = campaign.status === 'Cancelled'
    ? 'Cancelled'
    : campaign.status === 'TargetReached' || (campaign.suggestedActivation > 0 && accepted >= campaign.suggestedActivation)
      ? 'TargetReached'
    : offers.some((offer) => offer.status === 'Open') ? 'Running' : accepted ? 'Completed' : 'Closed'
  const viewed = offers.filter((offer) => offer.status !== 'Open').length
  state = {
    ...state,
    campaigns: state.campaigns.map((item) => item.id === campaignId ? {
      ...item,
      status,
      viewed: Math.max(item.viewed, viewed),
      accepted,
      declined: count('Declined'),
      expired: count('Expired'),
      cancelled: count('Cancelled'),
      enRoute: Math.max(item.enRoute, accepted),
      unitsGained: Math.min(item.arrivedVerified, accepted),
    } : item),
  }
}
const progressSimulated = () => { for (const offer of state.offers.filter((item) => item.status === 'Open')) { const campaign = state.campaigns.find((item) => item.id === offer.campaignId); if (campaign?.responseMode === 'simulated' || (campaign?.responseMode === 'mixed' && offer.driverId !== 'DRV-001')) { void respond(offer.id, offer.distanceKm < 4 ? 'Accepted' : 'Declined', 'simulated') } } }
const respond = (offerId: string, response: 'Accepted' | 'Declined', source: 'human' | 'simulated') => { const offer = state.offers.find((item) => item.id === offerId); if (!offer) throw new Error('Không tìm thấy offer.'); if (offer.status !== 'Open') throw new Error('Offer không còn hiệu lực.'); const status = response; const updated = { ...offer, status, responseSource: source, respondedAt: new Date().toISOString() } as Offer; state = { ...state, offers: state.offers.map((item) => item.id === offerId ? updated : item), drivers: state.drivers.map((driver) => driver.id !== offer.driverId ? driver : response === 'Accepted' ? { ...driver, status: 'en_route', acceptedOfferIds: [...driver.acceptedOfferIds, offerId], rewardTotal: driver.rewardTotal + offer.incentiveAmount } : driver) }; refreshCampaign(offer.campaignId); const campaign = state.campaigns.find((item) => item.id === offer.campaignId); if (campaign?.status === 'TargetReached') { state = { ...state, offers: state.offers.map((item) => item.campaignId === campaign.id && item.status === 'Open' ? { ...item, status: 'Expired' as const } : item) }; refreshCampaign(campaign.id) } audit(campaign?.planId ?? '', response === 'Accepted' ? 'OfferAccepted' : 'OfferDeclined', source === 'human' ? offer.driverId : 'Response simulator', `${response === 'Accepted' ? 'Nhận' : 'Từ chối'} offer ${offer.id}.`); return updated }
const queryAudit = (filters: AuditFilters): AuditPage => {
  const filtered = state.audit.filter((entry) => (!filters.entityId || entry.planId === filters.entityId || entry.entityId === filters.entityId)
    && (!filters.entityType || (entry.entityType ?? (entry.planId ? 'proposal' : undefined)) === filters.entityType)
    && (!filters.action || entry.action === filters.action)
    && (!filters.actorType || (entry.actorType ?? entry.actor).toUpperCase() === filters.actorType.toUpperCase())
    && (!filters.actorId || entry.actorId === filters.actorId)
    && (!filters.from || entry.occurredAt >= filters.from)
    && (!filters.to || entry.occurredAt <= filters.to))
  const offset = (filters.page - 1) * filters.pageSize
  const totalPages = filtered.length === 0 ? 0 : Math.ceil(filtered.length / filters.pageSize)
  return { items: clone(filtered.slice(offset, offset + filters.pageSize)), page: filters.page, pageSize: filters.pageSize, total: filtered.length, totalPages, hasPreviousPage: filters.page > 1, hasNextPage: filters.page < totalPages }
}
const mockOperationsReport = (filters: OperationsReportFilters): OperationsReport => {
  const campaigns = state.campaigns.filter((campaign) => (!filters.campaignId || campaign.id === filters.campaignId)
    && (!filters.from || campaign.startedAt >= filters.from)
    && (!filters.to || campaign.startedAt <= filters.to))
  const rows = campaigns.map((campaign) => ({ id: campaign.id, status: campaign.status, startedAt: campaign.startedAt, completedAt: null, activatedDrivers: campaign.unitsGained, qualifiedTrips: campaign.qualifiedTrips, rewardQualifiedVnd: 0, rewardPaidVnd: 0, budgetUsedVnd: campaign.incentiveBudget, budgetLimitVnd: campaign.budgetLimit, reservedVnd: campaign.worstCaseCommitment, committedVnd: campaign.incentiveBudget, qualifiedVnd: 0, paidVnd: 0, compensationDueVnd: 0, releasedVnd: 0, rewardBudgetDeltaVnd: campaign.incentiveBudget, netCostVnd: null, auditEvents: state.audit.filter((entry) => entry.entityId === campaign.id).length }))
  const sum = (field: 'activatedDrivers' | 'qualifiedTrips' | 'rewardQualifiedVnd' | 'rewardPaidVnd' | 'budgetUsedVnd' | 'reservedVnd' | 'committedVnd' | 'qualifiedVnd' | 'paidVnd' | 'compensationDueVnd' | 'releasedVnd' | 'rewardBudgetDeltaVnd' | 'auditEvents') => rows.reduce((total, campaign) => total + campaign[field], 0)
  return { generatedAt: new Date().toISOString(), dataMode: 'SIMULATED', summary: { campaigns: rows.length, activatedDrivers: sum('activatedDrivers'), qualifiedTrips: sum('qualifiedTrips'), rewardQualifiedVnd: sum('rewardQualifiedVnd'), rewardPaidVnd: sum('rewardPaidVnd'), budgetUsedVnd: sum('budgetUsedVnd'), reservedVnd: sum('reservedVnd'), committedVnd: sum('committedVnd'), qualifiedVnd: sum('qualifiedVnd'), paidVnd: sum('paidVnd'), compensationDueVnd: sum('compensationDueVnd'), releasedVnd: sum('releasedVnd'), rewardBudgetDeltaVnd: sum('rewardBudgetDeltaVnd'), auditEvents: sum('auditEvents'), netCostVnd: null }, campaigns: rows, sources: { activatedDrivers: 'simulated campaign state', qualifiedTrips: 'simulated campaign state', rewardQualifiedVnd: 'unavailable in mock ledger', rewardPaidVnd: 'unavailable in mock ledger', budgetUsedVnd: 'simulated campaign state', budgetLifecycle: 'simulated budget lifecycle', auditEvents: 'simulated audit state', netCostVnd: null } }
}

export const mockOperatorAdapter: OperatorDataAdapter = {
  getCapabilities: () => requestLocal(() => ({
    serverTime: new Date().toISOString(),
    timezone: 'Asia/Ho_Chi_Minh' as const,
    capabilities: {
      forecastHorizons: { available: true, enabled: true, values: [5, 10, 15] },
      proposalReview: { available: true, enabled: true },
      dispatchRelease: { available: true, enabled: true },
      dispatchReconciliation: { available: true, enabled: true },
      activationRelease: { available: true, enabled: true },
      compensationSettlement: { available: true, enabled: true },
      scenarioComparison: { available: true, enabled: true },
    },
  })),
  generateAiDecision: async () => mockOperatorAdapter.getSnapshot('baseline'),
  optimizeAiDecision: async () => {
    const proposal = { ...clone(state.plans[0]!), inputSnapshotId: '17:00' }
    state = { ...state, plans: [proposal, ...state.plans.slice(1)] }
    return { planningStatus: 'proposal_created', proposal: clone(proposal) }
  },
  runReplayStep: async (sourceAt) => ({ ...await mockOperatorAdapter.getSnapshot('baseline'), sourceAt }),
  // Mock dựng lại đúng hình dạng của cửa sổ replay thật: các mốc 5 phút lùi dần từ `sourceAt`,
  // mỗi mốc kèm tổng cầu/cung. Nhịp ngày dùng hàm sin theo giờ để có hai đỉnh sáng/chiều như
  // dataset thật — số mô phỏng, nhưng hình dạng để kiểm thử UI thì đúng.
  getReplayWindow: async (sourceAt, lookbackMinutes = 60) => {
    const stepCount = Math.max(1, Math.floor(lookbackMinutes / 5));
    const meanRain = baseZones.reduce((sum, zone) => sum + zone.rainMmH, 0) / baseZones.length
    const endsAt = Date.parse(sourceAt)
    return Array.from({ length: stepCount + 1 }, (_, index) => {
      const at = new Date(endsAt - (stepCount - index) * 5 * 60_000)
      const hour = at.getHours() + at.getMinutes() / 60
      const rhythm = 0.55 + 0.45 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + 0.35 * Math.sin(((hour - 6) / 12) * 2 * Math.PI)
      const demand = Math.max(40, Math.round(300 * rhythm))
      return { sourceAt: at.toISOString(), meanRainMmH: meanRain, totalDemand: demand, totalSupply: Math.round(demand * 1.12) }
    })
  },
  getSnapshot: (comparison, demoScenarioId = state.scenarioId, replayIndex = 0) => requestLocal(() => {
    const scenario = scenarios.find((item) => item.id === demoScenarioId) ?? scenarios[0]!
    const gain = state.campaigns.reduce((sum, campaign) => sum + campaign.unitsGained, 0)
    const simulation = simulateSnapshot(baseZones, { comparison, gain, regime: scenario.regime, replayIndex })
    return clone({
      generatedAt: new Date().toISOString(),
      replayStep: `${String(17 + Math.floor(replayIndex / 12)).padStart(2, '0')}:${String((replayIndex % 12) * 5).padStart(2, '0')}`,
      scenario: comparison,
      demoScenarioId,
      regime: scenario.regime,
      ai: {
        zoneContract: 'AI_ZONE_1_30', registeredZones: 30, liveZones: 30, forecastedZones: 30,
        horizons: [5, 10, 15], modelVersion: 'mock-forecast-v1', forecastMode: 'simulated',
        dataSource: 'mock snapshot engine', forecastAt: new Date().toISOString(), forecastRunId: `mock-${replayIndex}`,
        forecastStatus: 'COMPLETED',
        forecastRuns: ([5, 10, 15] as const).map((horizonMinutes) => ({
          id: `mock-${replayIndex}-${horizonMinutes}`, horizonMinutes, status: 'COMPLETED' as const,
          modelVersion: 'mock-forecast-v1', featureVersion: 'mock-feature-v1', policyVersion: 'mock-policy-v1', inputHash: `mock-input-${replayIndex}-${horizonMinutes}`,
          forecastMode: 'simulated', dataSource: 'mock snapshot engine', forecastAt: new Date().toISOString(), completedAt: new Date().toISOString(), zoneCount: 30,
        })),
      },
      ...simulation,
    } satisfies Snapshot)
  }),
  listScenarios: () => requestLocal(() => clone(scenarios)), getBaselines: () => requestLocal(() => clone(baselines)), getOperationsReport: (filters) => requestLocal(() => clone(mockOperationsReport(filters))),
  loadScenario: (scenarioId) => requestLocal(() => { state = scenarioState(scenarioId); audit('', 'ScenarioLoaded', 'Hệ thống', `Đồng bộ snapshot ${scenarioId} và sinh 3 phương án.`) }),
  resetDemo: () => requestLocal(() => { state = initialState(); audit('', 'DemoReset', 'Điều phối viên', 'Khôi phục dữ liệu demo và hàng đợi offer.') }),
  listPlans: () => requestLocal(() => { refreshStaleProposals(); return clone(state.plans.map((plan) => withLiveEligibility(plan, state.drivers))) }),
  getPlan: (id) => requestLocal(() => { refreshStaleProposals(); const plan = planFor(id); return clone(plan ? withLiveEligibility(plan, state.drivers) : undefined) }),
  listCampaigns: () => requestLocal(() => { progressSimulated(); return clone(state.campaigns) }), listOffers: (campaignId) => requestLocal(() => clone(state.offers.filter((offer) => !campaignId || offer.campaignId === campaignId))), listAudit: () => requestLocal(() => clone(state.audit)), queryAudit: (filters) => requestLocal(() => queryAudit(filters)),
  revisePlan: (planId, request) => requestLocal(() => {
    const plan = planFor(planId)
    const isReviewable = plan?.status === 'UnderReview' || plan?.status === 'Revised'
    if (!plan || !isReviewable || request.expectedVersion !== plan.version || !request.note.trim() || request.fareMultiplier > 1.2 || Object.values(request.moveQuantities).some((quantity) => quantity < 0)) throw new Error('Nội dung chỉnh sửa không hợp lệ hoặc đã cũ.')
    const revisedId = `PLN-${String(state.nextProposalNumber).padStart(3, '0')}`
    const revised = withLiveEligibility(reviseAgentPlan(plan, request, revisedId), state.drivers)
    state = { ...state, nextProposalNumber: state.nextProposalNumber + 1, plans: [revised, ...state.plans.map((item) => item.id === planId ? { ...item, status: 'Stale' as const } : item)] }
    audit(revised.id, 'Revised', 'Điều phối viên', `Phiên bản ${revised.version} kế thừa ${plan.id}: ${request.note}`)
    return clone(revised)
  }),
  approvePlan: (planId, expectedVersion, note = '') => requestLocal(() => {
    const plan = planFor(planId)
    const isReviewable = plan?.status === 'UnderReview' || plan?.status === 'Revised'
    if (!plan || !isReviewable || !isPlanInputFresh(plan.inputFreshUntil) || !plan.policyChecks.every((check) => check.passed)) throw new Error('Không thể phê duyệt: snapshot cũ hoặc còn policy chưa đạt.')
    if (expectedVersion !== plan.version) throw new Error('Proposal version changed before approval.')
    const approved = { ...plan, status: 'Approved' as const }
    state = { ...state, plans: state.plans.map((item) => item.id === planId ? approved : item) }
    audit(planId, 'Approved', 'Điều phối viên', note.trim() || 'Đã kiểm tra snapshot, policy, tác động và ngân sách.')
    return clone(approved)
  }),
  rejectPlan: (planId, request) => requestLocal(() => {
    const plan = planFor(planId)
    const isReviewable = plan?.status === 'UnderReview' || plan?.status === 'Revised'
    if (!plan || !isReviewable || !request.note.trim()) throw new Error('Cần lý do từ chối.')
    if (request.expectedVersion !== plan.version) throw new Error('Proposal version changed before rejection.')
    const rejected = { ...plan, status: 'Rejected' as const }
    state = { ...state, plans: state.plans.map((item) => item.id === planId ? rejected : item) }
    audit(planId, 'Rejected', 'Điều phối viên', `[${request.reasonCode}] ${request.note}`)
    return clone(rejected)
  }),
  cancelApprovedPlan: (planId, reason) => requestLocal(() => {
    const plan = planFor(planId)
    if (!plan || plan.status !== 'Approved') throw new Error('Chỉ có thể hủy phương án đã duyệt.')
    if (state.campaigns.some((item) => item.planId === planId) || dispatches.some((item) => item.proposalId === planId)) {
      throw new Error('Phương án đã được đưa vào thực hiện; hãy dừng ở trang điều hành.')
    }
    if (reason.trim().length < 3) throw new Error('Cần lý do hủy phương án.')
    const cancelled = { ...plan, status: 'Stale' as const }
    state = { ...state, plans: state.plans.map((item) => item.id === planId ? cancelled : item) }
    audit(planId, 'ProposalCancelled', 'Điều phối viên', `Hủy phương án đã duyệt: ${reason.trim()}`)
    return clone(cancelled)
  }),
  startCampaign: (planId, mode = 'mixed') => requestLocal(() => {
    const plan = planFor(planId)
    if (plan?.status !== 'Approved') throw new Error('Chỉ phát hành offer sau khi phê duyệt plan.')
    if (plan && !isPlanInputFresh(plan.inputFreshUntil)) throw new Error('Phương án đã hết hiệu lực. Hãy tính lại trước khi thực hiện.')
    if (!plan.targetZoneId) throw new Error('Proposal must have a target zone before campaign activation.')
    const existing = state.campaigns.find((item) => item.planId === planId)
    if (existing) return clone(existing)
    const candidates = eligibleDriversFor(plan, state.drivers)
    const startedAt = new Date().toISOString()
    const campaign: Campaign = {
      id: `CMP-${state.campaigns.length + 20}`,
      planId,
      status: candidates.length ? 'Running' : 'Closed',
      targetZoneId: plan.targetZoneId,
      candidateCount: candidates.length,
      offersSent: candidates.length,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      cancelled: 0,
      enRoute: 0,
      arrivedVerified: 0,
      unitsGained: 0,
      qualifiedTrips: 0,
      incentiveBudget: 0,
      budgetLimit: plan.budgetLimit,
      worstCaseCommitment: candidates.length * plan.relocationBonus,
      startedAt,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      responseMode: mode,
      suggestedActivation: plan.targetDriverCount,
    }
    const offers = candidates.map((driver, index) => ({
      id: `OFF-${state.offers.length + index + 1}`,
      campaignId: campaign.id,
      driverId: driver.id,
      targetZoneId: campaign.targetZoneId,
      reasonText: `${plan.targetZoneLabel} dự báo thiếu ${plan.metrics.residualGap} xe. Thưởng ${plan.relocationBonus.toLocaleString('vi-VN')}đ, cách ${driver.distanceKm}km (~${Math.round(driver.distanceKm * 3)} phút). Bạn có thể từ chối.`,
      incentiveAmount: plan.relocationBonus,
      distanceKm: driver.distanceKm,
      etaMinutes: Math.round(driver.distanceKm * 3),
      expiresAt: campaign.expiresAt,
      status: 'Open' as const,
    }))
    state = { ...state, campaigns: [campaign, ...state.campaigns], offers: [...offers, ...state.offers] }
    audit(planId, 'ActivationStarted', 'Điều phối viên', `Phát hành ${offers.length} offer (${mode}), cam kết tối đa ${campaign.worstCaseCommitment.toLocaleString('vi-VN')}đ.`)
    return clone(campaign)
  }),
  cancelCampaign: (campaignId) => requestLocal(() => { const campaign = state.campaigns.find((item) => item.id === campaignId); if (!campaign) throw new Error('Không tìm thấy chiến dịch.'); state = { ...state, campaigns: state.campaigns.map((item) => item.id === campaignId ? { ...item, status: 'Cancelled' as const } : item), offers: state.offers.map((offer) => offer.campaignId === campaignId && offer.status === 'Open' ? { ...offer, status: 'Expired' as const } : offer) }; refreshCampaign(campaignId); audit(campaign.planId, 'CampaignCancelled', 'Điều phối viên', `Hủy ${campaignId}.`); return clone(state.campaigns.find((item) => item.id === campaignId)!) }),
  getDriverView: (driverId) => requestLocal(() => { const driver = state.drivers.find((item) => item.id === driverId); if (!driver) return undefined; const history = state.offers.filter((offer) => offer.driverId === driverId); return clone({ driver, activeOffers: history.filter((offer) => offer.status === 'Open'), acceptedOffers: history.filter((offer) => offer.status === 'Accepted'), history } satisfies DriverView) }),
  listDrivers: () => requestLocal(() => clone(state.drivers)), setDriverStatus: (driverId, status) => requestLocal(() => { const driver = state.drivers.find((item) => item.id === driverId); if (!driver) throw new Error('Không tìm thấy tài xế.'); const updated = { ...driver, status }; state = { ...state, drivers: state.drivers.map((item) => item.id === driverId ? updated : item) }; return clone(updated) }),
  respondToOffer: (offerId, response) => requestLocal(() => clone(respond(offerId, response, 'human'))),
  expireOffer: (offerId) => requestLocal(() => { const offer = state.offers.find((item) => item.id === offerId); if (!offer || offer.status !== 'Open') throw new Error('Offer không thể hết hạn.'); const expired = { ...offer, status: 'Expired' as const }; state = { ...state, offers: state.offers.map((item) => item.id === offerId ? expired : item) }; refreshCampaign(offer.campaignId); audit(state.campaigns.find((item) => item.id === offer.campaignId)?.planId ?? '', 'OfferExpired', 'Hệ thống', `Offer ${offer.id} hết hạn.`); return clone(expired) }),
  listDispatch: () => requestLocal(() => clone(dispatches)),
  releaseDispatch: (planId) => requestLocal(() => {
    const plan = planFor(planId)
    if (!plan || plan.status !== 'Approved') throw new Error('Phương án chưa được duyệt.')
    const existing = dispatches.find((batch) => batch.proposalId === planId)
    if (existing) return clone(existing)
    const batch: DispatchBatch = {
      id: `DSP-${dispatches.length + 1}`,
      proposalId: planId,
      proposalVersion: plan.version,
      approvedContentHash: plan.approvedContentHash ?? `mock-${plan.id}-${plan.version}`,
      status: 'QUEUED',
      releasedAt: new Date().toISOString(),
      moves: plan.moves.map((move) => ({ id: `DSP-MOVE-${move.id}`, sourceMoveKey: move.id, sourceZoneId: Number(move.sourceZoneId.replace(/^AI-Z/, '')), targetZoneId: Number(move.targetZoneId.replace(/^AI-Z/, '')), plannedUnits: move.quantity, acknowledgedUnits: 0, arrivedUnits: 0, availableUnits: 0, failedUnits: 0, state: 'PLANNED', routeSource: 'mock-model', etaMinutes: move.etaMinutes, distanceKm: move.distanceKm })),
      reconciliations: [],
    }
    dispatches = [batch, ...dispatches]
    return clone(batch)
  }),
  cancelDispatch: (batchId, reason) => requestLocal(() => {
    const current = dispatches.find((batch) => batch.id === batchId)
    if (!current) throw new Error('Không tìm thấy batch điều chuyển.')
    const updated: DispatchBatch = { ...current, status: 'CANCELLED', moves: current.moves.map((move) => move.state === 'AVAILABLE' ? move : { ...move, state: 'CANCELLED' }) }
    dispatches = dispatches.map((batch) => batch.id === batchId ? updated : batch)
    audit(current.proposalId, 'DemoReset', 'Điều phối viên', `Dừng batch ${batchId}: ${reason}`)
    return clone(updated)
  }),
  retryDispatchMove: (batchId, moveId, reason) => requestLocal(() => {
    const current = dispatches.find((batch) => batch.id === batchId)
    if (!current) throw new Error('KhÃ´ng tÃ¬m tháº¥y batch Ä‘iá»u chuyá»ƒn.')
    const move = current.moves.find((candidate) => candidate.id === moveId)
    if (!move || move.state !== 'FAILED') throw new Error('Chá»‰ lÆ°á»£t Ä‘iá»u chuyá»ƒn tháº¥t báº¡i má»›i cÃ³ thá»ƒ thá»­ láº¡i.')
    const updated: DispatchBatch = { ...current, status: 'DISPATCHING', moves: current.moves.map((candidate) => candidate.id === moveId ? { ...candidate, state: 'SENT' } : candidate) }
    dispatches = dispatches.map((batch) => batch.id === batchId ? updated : batch)
    audit(current.proposalId, 'DispatchRetryRequested', 'Äiá»u phá»‘i viÃªn', `Thá»­ láº¡i ${moveId}: ${reason}`)
    return clone(updated)
  }),
  compareScenarios: (planId) => requestLocal(() => {
    const plan = planFor(planId)
    if (!plan) throw new Error('Không tìm thấy phương án.')
    return clone({
      id: `SCN-${plan.id}`,
      commonInputHash: `mock-${plan.inputSnapshotId}-${plan.forecastRunId ?? 'forecast'}`,
      snapshotId: plan.inputSnapshotId,
      forecastRunId: plan.forecastRunId ?? 'mock-forecast',
      modelVersion: plan.generatorVersion,
      policyVersion: 'policy-v1',
      scenarios: [
        { type: 'NO_ACTION' as const, estimatedMetrics: plan.metricsBefore, observedMetrics: null, uncertainty: { source: 'mock' }, responseSource: 'forecast_no_action' },
        { type: 'RELOCATION' as const, estimatedMetrics: plan.metricsAfterRelocation ?? plan.metrics, observedMetrics: null, uncertainty: { source: 'mock' }, responseSource: 'optimizer_estimate' },
        { type: 'ACTIVATION' as const, estimatedMetrics: plan.metricsAfterActivation ?? plan.metrics, observedMetrics: null, uncertainty: { source: 'mock' }, responseSource: 'policy_assumption' },
        { type: 'HYBRID' as const, estimatedMetrics: plan.metricsAfterActivation ?? plan.metrics, observedMetrics: null, uncertainty: { source: 'mock' }, responseSource: 'optimizer_plus_policy_assumption' },
      ],
      forecastEvaluation: {
        status: 'OBSERVED' as const,
        targetAt: new Date().toISOString(),
        evaluatedZones: 30,
        demandMae: 1.4,
        supplyMae: 0.8,
        demandMape: 8.7,
        demandIntervalCoverage: 86.7,
        supplyIntervalCoverage: 90,
        forecastFulfillmentRate: 82.3,
        observedFulfillmentRate: 80.9,
        fulfillmentRateError: 1.4,
        forecastResidualGap: 42,
        observedResidualGap: 46,
      },
      hasObservedRevenue: false as const,
      revenueNotice: 'Chưa có ledger doanh thu quan sát.',
    } satisfies ScenarioComparison)
  }),
  listNotifications: () => requestLocal(() => clone(notifications)),
  acknowledgeNotification: (notificationId) => requestLocal(() => {
    const current = notifications.find((notification) => notification.id === notificationId)
    if (!current) throw new Error('Không tìm thấy thông báo.')
    const updated: PersistentNotification = { ...current, status: 'ACKNOWLEDGED' }
    notifications = notifications.map((notification) => notification.id === notificationId ? updated : notification)
    return clone(updated)
  }),
  acknowledgeAllNotifications: () => requestLocal(() => {
    const updated = notifications.filter((notification) => notification.status === 'UNREAD').map((notification) => ({
      ...notification,
      status: 'ACKNOWLEDGED' as const,
    }))
    const updatedById = new Map(updated.map((notification) => [notification.id, notification]))
    notifications = notifications.map((notification) => updatedById.get(notification.id) ?? notification)
    return clone(updated)
  }),
  startPipelineRun: (horizonMinutes) => requestLocal(() => {
    const runId = `RUN-${Date.now()}`
    mockPipelineRuns.set(runId, {
      record: buildMockPipelineRun(runId, horizonMinutes),
      events: buildMockRunEvents(),
      revealed: 0,
    })
    return { runId, status: 'RUNNING' }
  }),
  getPipelineRun: (runId) => requestLocal(() => {
    const run = mockPipelineRuns.get(runId)
    if (!run) throw new Error('Không tìm thấy run pipeline.')
    // Nhả dần từng nhóm dòng thay vì trả hết ngay: tiêu chí nghiệm thu của tính năng là
    // "dòng phải hiện dần, không hiện một lượt", và bản mock là nơi duy nhất kiểm được điều
    // đó mà không cần dựng AI service.
    run.revealed = Math.min(run.events.length, run.revealed + eventsPerMockPoll)
    const isDone = run.revealed >= run.events.length
    return clone({
      ...run.record,
      status: isDone ? 'DONE' : 'RUNNING',
      events: run.events.slice(0, run.revealed),
    })
  }),
  askAgent: ({ sessionId, text }) => requestLocal(() => {
    const log = mockSessions.get(sessionId) ?? []
    const reply = mockAnswer(text)
    mockSessions.set(sessionId, [...log, ...reply.events.map((event, index) => ({
      ...event,
      seq: log.length + index + 1,
      at: new Date().toISOString(),
    }))])
    return { sessionId, action: reply.action }
  }),
  getAgentSession: (sessionId) => requestLocal(() => clone(mockSessions.get(sessionId) ?? [])),
  // Bản mock chạy không gateway: đúng trạng thái mặc định của dự án — định tuyến LLM tắt,
  // đồ thị đi đường cố định (CLAUDE.md §10.1).
  getLlmHealth: () => requestLocal(() => ({
    isRoutingEnabled: false,
    isApiKeyConfigured: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    analysis: { ok: false, model: 'google/gemini-3.7-flash', error: 'LLM_API_KEY chưa được đặt' },
    explanation: { ok: false, model: 'anthropic/claude-haiku-4.5', error: 'LLM_API_KEY chưa được đặt' },
  })),
}

const mockSessions = new Map<string, RunEvent[]>()

type MockLine = Omit<RunEvent, 'seq' | 'at'>

// Bản mock của agent quan sát. Cùng ranh giới với bản thật: nhóm chạm cổng phê duyệt được
// kiểm TRƯỚC, và không nhánh nào ở đây sinh ra action khác `start_run`.
function mockAnswer(text: string): { action: string | null; events: MockLine[] } {
  const t = text.toLowerCase()
  const has = (...keys: string[]) => keys.some((key) => t.includes(key))
  const observer = 'observer'

  if (has('duyệt', 'duyet', 'từ chối', 'tu choi', 'phát offer', 'phat offer', 'kích hoạt', 'kich hoat')) {
    return {
      action: null,
      events: [{
        kind: 'narration', actor: observer, source: 'system', ok: false, code: 'GATE_IS_UI_ONLY',
        text: 'Việc phê duyệt và phát hành offer không gõ được ở đây. Hai bước đó phải bấm ở đúng hộp thoại của chúng.',
      }],
    }
  }
  // Mốc ngoài tầm Model 1 bị chặn trước mọi nhánh khác, y như bản thật: model chỉ dự báo tới
  // +15 phút, còn +30 trên bảng là ngoại suy tuyến tính chứ không phải output model.
  const moc = /(\d{1,3})\s*(?:phút|phut|p|min)/.exec(t)
  if (moc && ![5, 10, 15].includes(Number(moc[1]))) {
    return {
      action: null,
      events: [{
        kind: 'narration', actor: observer, source: 'system', ok: false, code: 'HORIZON_NOT_FORECAST',
        text: Number(moc[1]) === 30
          ? 'Model 1 chỉ dự báo tới +15 phút. Mốc +30 phút có trên bảng nhưng là ngoại suy tuyến tính, không phải output model — và theo thiết kế thì nó không được dùng để tạo hay duyệt phương án.'
          : `Không có dự báo cho mốc +${moc[1]} phút. Model 1 chỉ chạy ở 5 phút, 10 phút, 15 phút.`,
      }],
    }
  }
  if (has('chạy phân tích', 'chay phan tich', 'phân tích', 'phan tich', 'chạy lại', 'chay lai', 'phương án mới')) {
    return {
      action: 'start_run',
      events: [{ kind: 'narration', actor: observer, source: 'deterministic', text: 'Bắt đầu một lượt phân tích mới.' }],
    }
  }
  if (has('thời tiết', 'thoi tiet', 'mưa', 'mua')) {
    return {
      action: null,
      events: [
        { kind: 'tool_started', actor: observer, source: 'deterministic', tool: 'get_weather', text: 'gọi get_weather()' },
        { kind: 'tool_finished', actor: observer, source: 'deterministic', tool: 'get_weather', ok: true, text: '23 zone mưa (ngưỡng 0.5 mm/h), 30 zone cao điểm' },
      ],
    }
  }
  if (has('cung', 'thiếu xe', 'thieu xe', 'hotspot', 'zone')) {
    return {
      action: null,
      events: [
        { kind: 'tool_started', actor: observer, source: 'deterministic', tool: 'get_supply_state', text: 'gọi get_supply_state()' },
        { kind: 'tool_finished', actor: observer, source: 'deterministic', tool: 'get_supply_state', ok: true, text: '5 hotspot chính sách, 28 zone dư, tổng cung rỗi 524 xe' },
      ],
    }
  }
  if (has('dự báo', 'du bao', 'forecast', 'nhu cầu', 'nhu cau')) {
    return {
      action: null,
      events: [
        { kind: 'tool_started', actor: observer, source: 'deterministic', tool: 'run_forecast', text: 'gọi run_forecast()' },
        { kind: 'tool_finished', actor: observer, source: 'deterministic', tool: 'run_forecast', ok: true, text: 'dự báo 30 zone, horizon 5 phút — regime rain_peak, model mock-forecast-v1' },
      ],
    }
  }
  return {
    action: null,
    events: [{
      kind: 'narration', actor: observer, source: 'deterministic',
      text: 'Chưa hiểu ý. Tôi làm được: chạy phân tích · xem dự báo · xem thời tiết · xem điều kiện di chuyển · xem tình hình cung.',
    }],
  }
}

// Một map giữ cả bản ghi lẫn nhật ký lẫn tiến độ nhả dòng — cùng lý do như `RunEntry` ở AI
// service: hai map song song là hai vòng đời phải tự đồng ý với nhau mà không có gì ép.
const mockPipelineRuns = new Map<string, { record: PipelineRunRecord; events: RunEvent[]; revealed: number }>()

// Bốn dòng mỗi lượt poll 2 giây: đủ chậm để thấy nó chạy, đủ nhanh để không phải chờ một phút.
const eventsPerMockPoll = 4

// Bản sao rút gọn của nhật ký thật (26 dòng ở chế độ deterministic). Số liệu khớp với
// `buildMockPipelineRun` bên dưới để hai chỗ trên cùng màn hình không nói hai con số khác nhau.
function buildMockRunEvents(): RunEvent[] {
  const base = Date.now()
  const lines: readonly Omit<RunEvent, 'seq' | 'at'>[] = [
    { kind: 'run_started', actor: 'graph', text: 'nhận yêu cầu phân tích snapshot demo', source: 'system' },
    { kind: 'narration', actor: 'graph', text: 'snapshot mới, cần đánh giá — vào nhánh NEW_INCIDENT', source: 'deterministic' },
    { kind: 'agent_started', actor: 'situation_assessment', text: 'đánh giá tình hình cung–cầu', source: 'deterministic' },
    { kind: 'tool_started', actor: 'situation_assessment', text: 'gọi run_forecast()', source: 'deterministic', tool: 'run_forecast' },
    { kind: 'tool_finished', actor: 'situation_assessment', text: 'dự báo 30 zone, horizon 5 phút — regime rain_peak, model mock-forecast-v1', source: 'deterministic', tool: 'run_forecast', ok: true },
    { kind: 'tool_started', actor: 'situation_assessment', text: 'gọi get_weather()', source: 'deterministic', tool: 'get_weather' },
    { kind: 'tool_finished', actor: 'situation_assessment', text: '23 zone mưa (ngưỡng 0.5 mm/h), 30 zone cao điểm', source: 'deterministic', tool: 'get_weather', ok: true },
    { kind: 'tool_started', actor: 'situation_assessment', text: 'gọi get_supply_state()', source: 'deterministic', tool: 'get_supply_state' },
    { kind: 'tool_finished', actor: 'situation_assessment', text: '5 hotspot chính sách, 28 zone dư, tổng cung rỗi 524 xe', source: 'deterministic', tool: 'get_supply_state', ok: true },
    { kind: 'agent_finished', actor: 'situation_assessment', text: 'đánh giá xong (WARNING)', source: 'deterministic', ok: false },
    { kind: 'agent_started', actor: 'dispatch', text: 'sinh phương án điều chuyển', source: 'deterministic' },
    { kind: 'tool_started', actor: 'dispatch', text: 'gọi compute_relocation()', source: 'deterministic', tool: 'compute_relocation' },
    { kind: 'tool_finished', actor: 'dispatch', text: '6 chặng, 42 xe, chi phí 180000 VNĐ / trần 500000 VNĐ, còn 2 zone chưa phủ hết', source: 'deterministic', tool: 'compute_relocation', ok: true },
    { kind: 'agent_finished', actor: 'dispatch', text: 'có phương án điều chuyển', source: 'deterministic', ok: true },
    { kind: 'narration', actor: 'graph', text: 'sinh 3 phương án theo strategy MIN_COST, BALANCED, MIN_ETA', source: 'deterministic' },
    { kind: 'agent_started', actor: 'optimization', text: 'chấm điểm và xếp hạng phương án', source: 'deterministic' },
    { kind: 'agent_finished', actor: 'optimization', text: '3 phương án đã chấm, khuyến nghị PLAN_B (ba chiến lược hội tụ)', source: 'deterministic', ok: true },
    { kind: 'narration', actor: 'graph', text: 'quality gate: phương án đạt ràng buộc tối thiểu', source: 'deterministic', ok: true },
    { kind: 'agent_started', actor: 'explanation', text: 'viết lời giải thích cho điều phối viên', source: 'deterministic' },
    { kind: 'tool_finished', actor: 'explanation', text: 'lấy số nguồn để viết giải thích: 6 chặng, 42 xe, 180000 VNĐ', source: 'deterministic', tool: 'render_explanation', ok: true },
    { kind: 'agent_finished', actor: 'explanation', text: 'giải thích xong (lớp template)', source: 'deterministic', ok: true },
    { kind: 'narration', actor: 'graph', text: 'dựng quyết định cuối từ phương án BALANCED', source: 'deterministic' },
    { kind: 'run_finished', actor: 'graph', text: 'hoàn tất — quyết định sẵn sàng để duyệt', source: 'system', ok: true },
  ]
  return lines.map((line, index) => ({
    ...line,
    seq: index + 1,
    // Giãn 400ms mỗi dòng để cột giờ đọc ra một tiến trình, không phải 23 dòng cùng một giây.
    at: new Date(base + index * 400).toISOString(),
  }))
}

function buildMockPipelineRun(runId: string, horizonMinutes: number): PipelineRunRecord {
  return {
    run_id: runId,
    status: 'DONE',
    routing_mode: 'deterministic',
    policy_version: 'policy-v1',
    model_version: 'mock-forecast-v1',
    agents: {
      situation_assessment: {
        status: 'DONE',
        message: '',
        capabilities: {
          forecast: { status: 'DONE', message: '' },
          traffic: { status: 'DONE', message: 'Rain Impact: +15% Travel Time' },
          supply: { status: 'WARNING', message: 'Còn 2 zone chưa đủ nguồn.' },
        },
      },
      dispatch: { status: 'DONE', message: '', capabilities: {} },
      optimization: { status: 'DONE', message: '', capabilities: {} },
      explanation: { status: 'DONE', message: '', capabilities: {} },
    },
    tool_calls: [
      { agent: 'situation_assessment', tool: 'run_forecast', ok: true, detail: '' },
      { agent: 'situation_assessment', tool: 'get_supply_state', ok: true, detail: '' },
      { agent: 'dispatch', tool: 'compute_relocation', ok: true, detail: '' },
      { agent: 'explanation', tool: 'render_explanation', ok: true, detail: '' },
    ],
    plan_set: {
      plans: [
        { plan_id: 'PLAN_A', strategy: 'MIN_COST', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
        { plan_id: 'PLAN_B', strategy: 'BALANCED', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
        { plan_id: 'PLAN_C', strategy: 'MIN_ETA', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
      ],
      converged: true,
      distinct_plan_count: 1,
    },
    recommended_plan_id: 'PLAN_B',
    quality_ok: true,
    quality_reason: '',
    explanation: { text: `Điều 42 xe qua 6 chặng, chi phí 180.000 VNĐ, xử lý 5 hotspot chính sách. Còn 2 zone chưa phủ hết thiếu hụt.`, layer: 'template' },
    warnings: [
      { code: 'PLAN_STRATEGIES_CONVERGED', severity: 'info', message: 'Ba chiến lược cho ra cùng một phương án.' },
    ],
    decision: { planning_status: 'optimizer_evaluated', horizon_min: horizonMinutes },
  }
}
