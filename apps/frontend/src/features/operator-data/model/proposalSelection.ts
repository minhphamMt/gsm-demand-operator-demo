import type { Campaign, DispatchBatch, Proposal } from '@/features/operator-data/model/types'
import { isPlanInputFresh, isProposalReviewable } from '@/features/operator-data/model/proposalRules'

const newestProposalFirst = (left: Proposal, right: Proposal) =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.rank - right.rank

/**
 * Return the latest model record for the exact snapshot, including a failed
 * generation. Failed records are useful evidence for the operator flow, but
 * they must not be treated as reviewable proposals.
 */
export function latestAgentProposalRecordForSnapshot(
  plans: readonly Proposal[] | undefined,
  snapshotId: string,
  now = new Date(),
) {
  return plans
    ?.filter(
      (plan) => plan.generatorType === 'AGENT'
        && plan.inputSnapshotId === snapshotId
        && !['Rejected', 'Stale'].includes(plan.status)
        && (plan.status !== 'Approved' || isPlanInputFresh(plan.inputFreshUntil, now)),
    )
    .sort(newestProposalFirst)[0]
}

export function latestAgentProposalForSnapshot(
  plans: readonly Proposal[] | undefined,
  snapshotId: string,
  now = new Date(),
) {
  const proposal = latestAgentProposalRecordForSnapshot(plans, snapshotId, now)
  return proposal && (isProposalReviewable(proposal, now)
    || (proposal.status === 'Approved' && isPlanInputFresh(proposal.inputFreshUntil, now)))
    ? proposal
    : undefined
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
  now = new Date(),
) {
  const executedPlanIds = new Set([
    ...(campaigns ?? []).map((campaign) => campaign.planId),
    ...(dispatches ?? []).map((dispatch) => dispatch.proposalId),
  ])

  return plans
    ?.filter((plan) => plan.status === 'Approved'
      && isPlanInputFresh(plan.inputFreshUntil, now)
      && !executedPlanIds.has(plan.id))
    .sort(newestProposalFirst)[0]
}
