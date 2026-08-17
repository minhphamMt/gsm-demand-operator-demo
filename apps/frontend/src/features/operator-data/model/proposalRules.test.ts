import { describe, expect, it } from 'vitest'

import { isPlanInputFresh, isProposalReviewable } from '@/features/operator-data/model/proposalRules'

describe('plan input freshness', () => {
  it('distinguishes fresh and stale proposal input', () => {
    const now = new Date('2026-08-05T09:30:00+07:00')
    expect(isPlanInputFresh('2026-08-05T09:38:00+07:00', now)).toBe(true)
    expect(isPlanInputFresh('2026-08-05T09:29:00+07:00', now)).toBe(false)
  })

  it('only allows a fresh, reviewable revision into the approval flow', () => {
    const now = new Date('2026-08-05T09:30:00+07:00')
    expect(isProposalReviewable({ status: 'UnderReview', inputFreshUntil: '2026-08-05T09:38:00+07:00' }, now)).toBe(true)
    expect(isProposalReviewable({ status: 'Approved', inputFreshUntil: '2026-08-05T09:38:00+07:00' }, now)).toBe(false)
    expect(isProposalReviewable({ status: 'UnderReview', inputFreshUntil: '2026-08-05T09:29:00+07:00' }, now)).toBe(false)
  })
})
