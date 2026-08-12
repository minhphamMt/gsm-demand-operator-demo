import { isCampaignActionable } from './campaignLifecycle'
import type { DriverOffer } from './types'

export function isOfferPending(offer: DriverOffer, now: number) {
  if (!isCampaignActionable(offer.campaigns, now)) return false
  if (offer.status !== 'SENT' && offer.status !== 'VIEWED') return false
  if (!offer.expires_at) return true
  return new Date(offer.expires_at).getTime() > now
}

export function isOfferActive(offer: DriverOffer, now: number) {
  return offer.status === 'ACCEPTED' && isCampaignActionable(offer.campaigns, now)
}

export function hasOfferLifecycleDeadline(offer: DriverOffer, now: number) {
  return [
    offer.expires_at,
    offer.campaigns?.start_at,
    offer.campaigns?.end_at,
    offer.campaigns?.reward_cutoff_at,
  ].some((value) => {
    if (!value) return false
    const deadline = new Date(value).getTime()
    return Number.isFinite(deadline) && deadline > now
  })
}
