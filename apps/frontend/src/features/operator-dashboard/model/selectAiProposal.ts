import type { Proposal } from '@/features/operator-data'

const reviewableStatuses: readonly Proposal['status'][] = ['UnderReview', 'Revised']

export function selectAiProposal(plans: readonly Proposal[] | undefined) {
  if (!plans) return undefined
  return plans
    .filter((plan) => plan.generatorType === 'AGENT' && reviewableStatuses.includes(plan.status))
    .sort((left, right) => left.rank - right.rank || Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
}
