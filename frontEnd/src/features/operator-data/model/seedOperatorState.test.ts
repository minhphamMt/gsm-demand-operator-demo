import { describe, expect, it } from 'vitest'

import { createSeededOperatorState } from '@/features/operator-data/model/seedOperatorState'

describe('seeded operator state', () => {
  it('provides complete data for every operator workflow', () => {
    const state = createSeededOperatorState()

    expect(state.plans.filter((plan) => plan.generatorType === 'AGENT')).toHaveLength(7)
    expect(state.plans.filter((plan) => ['UnderReview', 'Revised'].includes(plan.status))).toHaveLength(3)
    expect(state.campaigns.map((campaign) => campaign.status)).toEqual(['Running', 'Completed', 'Cancelled'])
    expect(state.drivers).toHaveLength(8)
    expect(state.audit.length).toBeGreaterThanOrEqual(11)

    for (const campaign of state.campaigns) {
      const campaignOffers = state.offers.filter((offer) => offer.campaignId === campaign.id)
      expect(campaignOffers).toHaveLength(campaign.offersSent)
      expect(state.plans.some((plan) => plan.id === campaign.planId)).toBe(true)
      expect(campaign.candidateCount).toBeGreaterThanOrEqual(campaign.offersSent)
      expect(campaign.offersSent).toBeGreaterThanOrEqual(campaign.viewed)
      expect(campaign.viewed).toBeGreaterThanOrEqual(campaign.accepted)
      expect(campaign.accepted).toBeGreaterThanOrEqual(campaign.enRoute)
      expect(campaign.enRoute).toBeGreaterThanOrEqual(campaign.arrivedVerified)
      expect(campaign.arrivedVerified).toBeGreaterThanOrEqual(campaign.unitsGained)
    }

    for (const offer of state.offers) {
      expect(state.drivers.some((driver) => driver.id === offer.driverId)).toBe(true)
    }
  })
})
