import type { Campaign, DispatchBatch, Proposal } from '@/features/operator-data/model/types'

const blockingCampaignStatuses = new Set<Campaign['status']>([
  'Draft',
  'Scheduled',
  'Active',
  'Paused',
  'Running',
  'Settling',
])

const blockingDispatchStatuses = new Set([
  'QUEUED',
  'DISPATCHING',
  'PARTIALLY_ACKED',
  'IN_PROGRESS',
])

export function isCampaignExecutionActive(campaign: Pick<Campaign, 'status'>) {
  return blockingCampaignStatuses.has(campaign.status)
}

export function isDispatchExecutionActive(dispatch: Pick<DispatchBatch, 'status'>) {
  return blockingDispatchStatuses.has(dispatch.status)
}

export function activeExecutionPlan(
  plans: readonly Proposal[] | undefined,
  campaigns: readonly Campaign[] | undefined,
  dispatches: readonly DispatchBatch[] | undefined,
) {
  const dispatch = dispatches?.find(isDispatchExecutionActive)
  const campaign = campaigns?.find(isCampaignExecutionActive)
  const planId = dispatch?.proposalId ?? campaign?.planId
  if (!planId) return undefined
  return {
    campaign: campaign?.planId === planId ? campaign : undefined,
    dispatch: dispatch?.proposalId === planId ? dispatch : undefined,
    plan: plans?.find((plan) => plan.id === planId),
    planId,
  }
}
