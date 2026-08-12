import { describe, expect, it } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

describe('driver activation closed loop', () => {
  it('loads three deterministic agent proposals for the active scenario and records their origin', async () => {
    await mockOperatorAdapter.resetDemo()
    await mockOperatorAdapter.loadScenario('holiday')
    const proposals = await mockOperatorAdapter.listPlans()
    expect(proposals).toHaveLength(3)
    expect(proposals.every((proposal) => proposal.scenarioId === 'holiday')).toBe(true)
    expect((await mockOperatorAdapter.listAudit()).some((entry) => entry.action === 'Created' && entry.actor === 'GSM-14 Agent')).toBe(true)
  })

  it('updates the campaign, driver state, audit and activation snapshot after acceptance', async () => {
    await mockOperatorAdapter.loadScenario('rain-peak')
    await mockOperatorAdapter.approvePlan('PLN-042')
    const campaign = await mockOperatorAdapter.startCampaign('PLN-042', 'human')
    const driver = await mockOperatorAdapter.getDriverView('DRV-001')
    const offer = driver?.activeOffers[0]
    expect(offer).toBeDefined()
    if (!offer) throw new Error('Missing mock offer')

    await mockOperatorAdapter.respondToOffer(offer.id, 'Accepted')
    const updatedCampaign = (await mockOperatorAdapter.listCampaigns()).find((item) => item.id === campaign.id)
    const updatedDriver = await mockOperatorAdapter.getDriverView('DRV-001')
    const snapshot = await mockOperatorAdapter.getSnapshot('activation', 'rain-peak', 2)

    expect(updatedCampaign?.accepted).toBe(1)
    expect(updatedCampaign?.enRoute).toBe(1)
    expect(updatedCampaign?.unitsGained).toBe(0)
    expect(updatedDriver?.driver.status).toBe('en_route')
    expect(snapshot.kpis.fleetAvailable).toBe(snapshot.zones.reduce((sum, zone) => sum + zone.supply, 0))
    expect((await mockOperatorAdapter.listAudit()).some((entry) => entry.action === 'OfferAccepted')).toBe(true)
  })

  it('keeps decline and expiry as non-punitive offer-history states', async () => {
    await mockOperatorAdapter.loadScenario('rain-peak')
    await mockOperatorAdapter.approvePlan('PLN-042')
    await mockOperatorAdapter.startCampaign('PLN-042', 'human')
    const firstDriver = await mockOperatorAdapter.getDriverView('DRV-001')
    const secondDriver = await mockOperatorAdapter.getDriverView('DRV-002')
    const firstOffer = firstDriver?.activeOffers[0]
    const secondOffer = secondDriver?.activeOffers[0]
    if (!firstOffer || !secondOffer) throw new Error('Missing mock offers')

    await mockOperatorAdapter.respondToOffer(firstOffer.id, 'Declined')
    await mockOperatorAdapter.expireOffer(secondOffer.id)

    expect((await mockOperatorAdapter.getDriverView('DRV-001'))?.history[0]?.status).toBe('Declined')
    expect((await mockOperatorAdapter.getDriverView('DRV-002'))?.history[0]?.status).toBe('Expired')
  })
})
