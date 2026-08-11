import { describe, expect, it } from 'vitest'

import { campaignPollInterval, offerPollInterval, visiblePollInterval } from '@/features/operator-data/api/operatorQueries'
describe('operator polling policy', () => {
  it('polls only visible active campaigns', () => {
    expect(campaignPollInterval(undefined, 'visible')).toBe(2_000)
    expect(campaignPollInterval([{ status: 'Active' }], 'visible')).toBe(2_000)
    expect(campaignPollInterval([{ status: 'Completed' }], 'visible')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active' }], 'hidden')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active', candidateCount: 0 }], 'visible')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active', budgetLimit: 100, incentiveBudget: 100 }], 'visible')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active', expiresAt: '2026-08-09T09:00:00.000Z' }], 'visible', new Date('2026-08-09T09:01:00.000Z'))).toBe(false)
  })

  it('stops offer polling when no open offer remains', () => {
    expect(offerPollInterval([{ status: 'Open' }], 'visible')).toBe(2_000)
    expect(offerPollInterval([{ status: 'Expired' }], 'visible')).toBe(false)
    expect(visiblePollInterval('hidden')).toBe(false)
  })
})
