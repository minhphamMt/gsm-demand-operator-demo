import type { Proposal } from '@/features/operator-data/model/types'

export function latestAgentProposalForSnapshot(
  plans: readonly Proposal[] | undefined,
  snapshotId: string,
) {
  return plans
    ?.filter(
      (plan) =>
        plan.generatorType === 'AGENT' && plan.inputSnapshotId === snapshotId,
    )
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        left.rank - right.rank,
    )[0]
}
