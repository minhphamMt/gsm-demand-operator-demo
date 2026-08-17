import type { Proposal } from '@/features/operator-data/model/types'

export function isPlanInputFresh(inputFreshUntil: string, now = new Date()) {
  return new Date(inputFreshUntil) >= now
}

/**
 * A proposal may only enter the review flow while its content is still the
 * current, reviewable revision. Approved proposals have a separate execution
 * flow and must never be sent through the review endpoint again.
 */
export function isProposalReviewable(
  plan: Pick<Proposal, 'status' | 'inputFreshUntil'> | undefined,
  now = new Date(),
) {
  return Boolean(
    plan
    && ['Generated', 'UnderReview', 'Revised'].includes(plan.status)
    && isPlanInputFresh(plan.inputFreshUntil, now),
  )
}
