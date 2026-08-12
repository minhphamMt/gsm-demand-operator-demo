import { describe, expect, it } from 'vitest'

import { isOfferActive, isOfferPending } from './offerLifecycle'
import type { DriverOffer } from './types'

const now = new Date('2026-08-12T09:00:00Z').getTime()
const offer = {
  id: 'offer-1',
  campaign_id: 'campaign-1',
  status: 'ACCEPTED',
  campaigns: { status: 'ACTIVE', start_at: null, end_at: '2026-08-12T10:00:00Z', reward_cutoff_at: null },
} as DriverOffer

describe('driver offer lifecycle selection', () => {
  it('does not resurrect accepted offers from closed campaigns', () => {
    expect(isOfferActive({ ...offer, campaigns: { ...offer.campaigns!, status: 'COMPLETED' } }, now)).toBe(false)
    expect(isOfferActive({ ...offer, campaigns: { ...offer.campaigns!, status: 'CANCELLED' } }, now)).toBe(false)
    expect(isOfferActive({ ...offer, campaigns: { ...offer.campaigns!, end_at: '2026-08-12T08:00:00Z' } }, now)).toBe(false)
    expect(isOfferActive(offer, now)).toBe(true)
  })

  it('requires pending offers to belong to an active campaign', () => {
    const pending = { ...offer, status: 'SENT' as const, expires_at: '2026-08-12T09:05:00Z' }
    expect(isOfferPending(pending, now)).toBe(true)
    expect(isOfferPending({ ...pending, campaigns: { ...offer.campaigns!, status: 'COMPLETED' } }, now)).toBe(false)
  })
})
