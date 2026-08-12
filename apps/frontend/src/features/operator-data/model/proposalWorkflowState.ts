import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import { isPlanInputFresh } from '@/features/operator-data/model/proposalRules'
import type { AuditEntry, DemoDriver, DemoScenarioId, Proposal } from '@/features/operator-data/model/types'

type ProposalQueueState = {
  scenarioId: DemoScenarioId
  nextProposalNumber: number
  plans: Proposal[]
  drivers: DemoDriver[]
  audit: AuditEntry[]
}

export function eligibleDriversFor(plan: Proposal, drivers: readonly DemoDriver[]) {
  return drivers
    .filter((driver) => (driver.status === 'offline' || driver.status === 'online_idle') && driver.distanceKm <= 8 && driver.shiftEndsInMinutes >= plan.campaignDurationMinutes)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, plan.expectedOfferCount)
}

export function withLiveEligibility(plan: Proposal, drivers: readonly DemoDriver[]): Proposal {
  return { ...plan, eligibleDriverCount: eligibleDriversFor(plan, drivers).length }
}

export function refreshStaleProposalQueue<TState extends ProposalQueueState>(state: TState): TState {
  const stalePlans = state.plans.filter((plan) => (plan.status === 'UnderReview' || plan.status === 'Revised') && !isPlanInputFresh(plan.inputFreshUntil))
  if (!stalePlans.length) return state
  const staleIds = new Set(stalePlans.map((plan) => plan.id))
  const generated = createAgentPlans(state.scenarioId, state.nextProposalNumber).slice(0, stalePlans.length)
  const createdEntries = generated.map((plan, index): AuditEntry => ({
    id: `AUD-${state.audit.length + index + 1}`,
    planId: plan.id,
    action: 'Created',
    actor: 'GSM-14 Agent',
    occurredAt: new Date().toISOString(),
    detail: `Agent tự làm mới phương án từ snapshot ${plan.inputSnapshotId} vì dữ liệu trước đã hết hạn.`,
  }))
  return {
    ...state,
    nextProposalNumber: state.nextProposalNumber + generated.length,
    plans: [...generated, ...state.plans.map((plan) => staleIds.has(plan.id) ? { ...plan, status: 'Stale' as const } : plan)],
    audit: [...createdEntries, ...state.audit],
  }
}
