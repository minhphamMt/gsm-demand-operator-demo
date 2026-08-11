import { describe, expect, it } from 'vitest'

import { campaignNotice } from '@/features/operator-campaigns/model/campaignState'
import type { Campaign } from '@/features/operator-data'

const campaign: Campaign = {
  id: 'campaign-1', planId: 'proposal-1', status: 'Active', targetZoneId: 'zone-1', candidateCount: 2,
  offersSent: 2, viewed: 0, accepted: 0, declined: 0, expired: 0, cancelled: 0, enRoute: 0,
  arrivedVerified: 0, unitsGained: 0, qualifiedTrips: 0, incentiveBudget: 0, budgetLimit: 100000,
  worstCaseCommitment: 100000, startedAt: '2026-08-09T08:00:00.000Z', expiresAt: '2026-08-09T09:00:00.000Z',
  responseMode: 'human', suggestedActivation: 2,
}

describe('campaignNotice', () => {
  it('explains target reached and cancellation results', () => {
    expect(campaignNotice({ ...campaign, status: 'TargetReached' })?.tone).toBe('success')
    expect(campaignNotice({ ...campaign, cancelled: 1, expired: 2, status: 'Cancelled' })?.message).toContain('1 tài xế')
  })

  it('distinguishes no candidates, exhausted budget, and expired time', () => {
    const beforeExpiry = new Date('2026-08-09T08:30:00.000Z')
    expect(campaignNotice({ ...campaign, candidateCount: 0 }, beforeExpiry)?.message).toContain('Không có tài xế')
    expect(campaignNotice({ ...campaign, incentiveBudget: 100000 }, beforeExpiry)?.message).toContain('Ngân sách')
    expect(campaignNotice(campaign, new Date('2026-08-09T09:01:00.000Z'))?.message).toContain('hết thời gian')
  })
})
