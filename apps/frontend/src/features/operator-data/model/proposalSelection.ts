import type { Campaign, DispatchBatch, Proposal } from '@/features/operator-data/model/types'

const newestProposalFirst = (left: Proposal, right: Proposal) =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.rank - right.rank

export function latestAgentProposalForSnapshot(
  plans: readonly Proposal[] | undefined,
  snapshotId: string,
) {
  return plans
    ?.filter(
      (plan) =>
        plan.generatorType === 'AGENT' && plan.inputSnapshotId === snapshotId,
    )
    .sort(newestProposalFirst)[0]
}

/**
 * An approved proposal remains actionable across navigation and replay bucket
 * changes until it is linked to a campaign or dispatch. Approval is persisted
 * server-side; it must not depend on the console's local workflow state.
 */
export function latestApprovedProposalAwaitingExecution(
  plans: readonly Proposal[] | undefined,
  campaigns: readonly Campaign[] | undefined,
  dispatches: readonly DispatchBatch[] | undefined,
) {
  const executedPlanIds = new Set([
    ...(campaigns ?? []).map((campaign) => campaign.planId),
    ...(dispatches ?? []).map((dispatch) => dispatch.proposalId),
  ])

  return plans
    ?.filter((plan) => plan.status === 'Approved' && !executedPlanIds.has(plan.id))
    .sort(newestProposalFirst)[0]
}
