import { describe, expect, it } from 'vitest'

import { campaignPollInterval, dispatchPollInterval, offerPollInterval, visiblePollInterval } from '@/features/operator-data/api/operatorQueries'
describe('operator polling policy', () => {
  it('polls only visible active campaigns', () => {
    expect(campaignPollInterval(undefined, 'visible')).toBe(15_000)
    expect(campaignPollInterval([{ status: 'Active' }], 'visible')).toBe(15_000)
    expect(campaignPollInterval([{ status: 'Completed' }], 'visible')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active' }], 'hidden')).toBe(false)
    expect(campaignPollInterval([{ status: 'Active' }], 'visible')).toBe(15_000)
  })

  it('stops offer polling when no open offer remains', () => {
    expect(offerPollInterval([{ status: 'Open' }], 'visible')).toBe(15_000)
    expect(offerPollInterval([{ status: 'Expired' }], 'visible')).toBe(false)
    expect(visiblePollInterval('hidden')).toBe(false)
  })

  it('polls dispatch only while a batch is active', () => {
    expect(dispatchPollInterval(undefined, 'visible')).toBe(15_000)
    expect(dispatchPollInterval([{ status: 'IN_PROGRESS' }], 'visible')).toBe(15_000)
    expect(dispatchPollInterval([{ status: 'EXECUTED' }], 'visible')).toBe(false)
    expect(dispatchPollInterval([{ status: 'IN_PROGRESS' }], 'hidden')).toBe(false)
  })
})
