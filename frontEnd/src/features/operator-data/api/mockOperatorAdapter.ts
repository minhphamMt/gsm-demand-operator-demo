import { requestLocal } from '@/shared/api/client'
import { createAgentPlans, reviseAgentPlan } from '@/features/operator-data/model/mockProposalEngine'
import { simulateSnapshot } from '@/features/operator-data/model/mockSnapshotEngine'
import { isPlanInputFresh } from '@/features/operator-data/model/proposalRules'
import { createSeededOperatorState } from '@/features/operator-data/model/seedOperatorState'
import { eligibleDriversFor, refreshStaleProposalQueue, withLiveEligibility } from '@/features/operator-data/model/proposalWorkflowState'
import { createZones } from '@/features/operator-data/model/zoneGeometry'
import type { AuditEntry, AuditFilters, AuditPage, Baseline, Campaign, DemoDriver, DemoScenario, DemoScenarioId, DriverView, Offer, OperationsReport, OperationsReportFilters, OperatorDataAdapter, Proposal, Snapshot } from '@/features/operator-data/model/types'

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
  const rows = campaigns.map((campaign) => ({ id: campaign.id, status: campaign.status, startedAt: campaign.startedAt, completedAt: null, activatedDrivers: campaign.unitsGained, qualifiedTrips: campaign.qualifiedTrips, rewardQualifiedVnd: 0, rewardPaidVnd: 0, budgetUsedVnd: campaign.incentiveBudget, budgetLimitVnd: campaign.budgetLimit, rewardBudgetDeltaVnd: campaign.incentiveBudget, netCostVnd: null, auditEvents: state.audit.filter((entry) => entry.entityId === campaign.id).length }))
  const sum = (field: 'activatedDrivers' | 'qualifiedTrips' | 'rewardQualifiedVnd' | 'rewardPaidVnd' | 'budgetUsedVnd' | 'rewardBudgetDeltaVnd' | 'auditEvents') => rows.reduce((total, campaign) => total + campaign[field], 0)
  return { generatedAt: new Date().toISOString(), dataMode: 'SIMULATED', summary: { campaigns: rows.length, activatedDrivers: sum('activatedDrivers'), qualifiedTrips: sum('qualifiedTrips'), rewardQualifiedVnd: sum('rewardQualifiedVnd'), rewardPaidVnd: sum('rewardPaidVnd'), budgetUsedVnd: sum('budgetUsedVnd'), rewardBudgetDeltaVnd: sum('rewardBudgetDeltaVnd'), auditEvents: sum('auditEvents'), netCostVnd: null }, campaigns: rows, sources: { activatedDrivers: 'simulated campaign state', qualifiedTrips: 'simulated campaign state', rewardQualifiedVnd: 'unavailable in mock ledger', rewardPaidVnd: 'unavailable in mock ledger', budgetUsedVnd: 'simulated campaign state', auditEvents: 'simulated audit state', netCostVnd: null } }
}

export const mockOperatorAdapter: OperatorDataAdapter = {
  generateAiDecision: async () => undefined,
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
    if (!plan || !isReviewable || !request.note.trim() || request.fareMultiplier > 1.2 || Object.values(request.moveQuantities).some((quantity) => quantity < 0)) throw new Error('Nội dung chỉnh sửa không hợp lệ.')
    const revisedId = `PLN-${String(state.nextProposalNumber).padStart(3, '0')}`
    const revised = withLiveEligibility(reviseAgentPlan(plan, request, revisedId), state.drivers)
    state = { ...state, nextProposalNumber: state.nextProposalNumber + 1, plans: [revised, ...state.plans.map((item) => item.id === planId ? { ...item, status: 'Stale' as const } : item)] }
    audit(revised.id, 'Revised', 'Điều phối viên', `Phiên bản ${revised.version} kế thừa ${plan.id}: ${request.note}`)
    return clone(revised)
  }),
  approvePlan: (planId, note = '') => requestLocal(() => {
    const plan = planFor(planId)
    const isReviewable = plan?.status === 'UnderReview' || plan?.status === 'Revised'
    if (!plan || !isReviewable || !isPlanInputFresh(plan.inputFreshUntil) || !plan.policyChecks.every((check) => check.passed)) throw new Error('Không thể phê duyệt: snapshot cũ hoặc còn policy chưa đạt.')
    const approved = { ...plan, status: 'Approved' as const }
    state = { ...state, plans: state.plans.map((item) => item.id === planId ? approved : item) }
    audit(planId, 'Approved', 'Điều phối viên', note.trim() || 'Đã kiểm tra snapshot, policy, tác động và ngân sách.')
    return clone(approved)
  }),
  rejectPlan: (planId, request) => requestLocal(() => {
    const plan = planFor(planId)
    const isReviewable = plan?.status === 'UnderReview' || plan?.status === 'Revised'
    if (!plan || !isReviewable || !request.note.trim()) throw new Error('Cần lý do từ chối.')
    const rejected = { ...plan, status: 'Rejected' as const }
    state = { ...state, plans: state.plans.map((item) => item.id === planId ? rejected : item) }
    audit(planId, 'Rejected', 'Điều phối viên', `[${request.reasonCode}] ${request.note}`)
    return clone(rejected)
  }),
  startCampaign: (planId, mode = 'mixed') => requestLocal(() => {
    const plan = planFor(planId)
    if (plan?.status !== 'Approved') throw new Error('Chỉ phát hành offer sau khi phê duyệt plan.')
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
}
