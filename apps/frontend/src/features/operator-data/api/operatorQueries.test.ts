import { describe, expect, it } from 'vitest'

import { campaignPollInterval, offerPollInterval, visiblePollInterval } from '@/features/operator-data/api/operatorQueries'
describe('operator polling policy', () => {
  it('polls only visible active campaigns', () => {
    expect(campaignPollInterval(undefined, 'visible')).toBe(30_000)
    expect(campaignPollInterval([{ status: 'Active' }], 'visible')).toBe(30_000)
    expect(campaignPollInterval([{ status: 'Completed' }], 'visible')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active' }], 'hidden')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active' }], 'visible')).toBe(30_000)
  })

  it('stops offer polling when no open offer remains', () => {
    expect(offerPollInterval([{ status: 'Open' }], 'visible')).toBe(30_000)
    expect(offerPollInterval([{ status: 'Expired' }], 'visible')).toBe(false)
    expect(visiblePollInterval('hidden')).toBe(false)
  })
})
