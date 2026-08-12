import { describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

describe('mock operator adapter', () => {
  it('re-simulates a revision, records approval flow, then cancels activation safely', async () => {
    await mockOperatorAdapter.resetDemo()
    const plan = await mockOperatorAdapter.getPlan('PLN-042')
    if (!plan) throw new Error('Missing proposal fixture')
    const revised = await mockOperatorAdapter.revisePlan('PLN-042', { moveQuantities: Object.fromEntries(plan.moves.map((move) => [move.id, move.id === 'MOV-01' ? 0 : move.quantity])), moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, move.sourceZoneId])), targetDriverCount: plan.targetDriverCount, campaignDurationMinutes: plan.campaignDurationMinutes, relocationBonus: plan.relocationBonus, zoneTripBonus: plan.zoneTripBonus, fareMultiplier: plan.fareMultiplier, budgetLimit: plan.budgetLimit, note: 'Giảm điều chuyển từ Cầu Giấy' })
    expect(revised.moves.some((move) => move.id === 'MOV-01')).toBe(false)
    expect(revised.version).toBe(2)

    expect(revised.id).not.toBe('PLN-042')
    expect((await mockOperatorAdapter.getPlan('PLN-042'))?.status).toBe('Stale')

    const approved = await mockOperatorAdapter.approvePlan(revised.id)
    expect(approved.status).toBe('Approved')

    const campaign = await mockOperatorAdapter.startCampaign(revised.id)
    expect(campaign.status).toBe('Running')
    const cancelled = await mockOperatorAdapter.cancelCampaign(campaign.id)
    expect(cancelled.status).toBe('Cancelled')
    expect(cancelled.expired).toBeGreaterThan(0)
    expect((await mockOperatorAdapter.listOffers(campaign.id)).every((offer) => offer.status === 'Expired')).toBe(true)

    const audit = await mockOperatorAdapter.listAudit()
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(['Revised', 'Approved', 'ActivationStarted', 'CampaignCancelled']))
  })

  it('closes remaining offers when the acceptance target is reached', async () => {
    await mockOperatorAdapter.resetDemo()
    const original = await mockOperatorAdapter.getPlan('PLN-042')
    if (!original) throw new Error('Missing proposal fixture')
    const revised = await mockOperatorAdapter.revisePlan(original.id, {
      moveQuantities: Object.fromEntries(original.moves.map((move) => [move.id, move.quantity])),
      moveSourceZoneIds: Object.fromEntries(original.moves.map((move) => [move.id, move.sourceZoneId])),
      targetDriverCount: 1,
      campaignDurationMinutes: original.campaignDurationMinutes,
      relocationBonus: original.relocationBonus,
      zoneTripBonus: original.zoneTripBonus,
      fareMultiplier: original.fareMultiplier,
      budgetLimit: original.budgetLimit,
      note: 'Kiểm thử đạt mục tiêu',
    })
    const plan = await mockOperatorAdapter.approvePlan(revised.id)
    const campaign = await mockOperatorAdapter.startCampaign(plan.id, 'human')
    const offers = await mockOperatorAdapter.listOffers(campaign.id)

    for (const offer of offers.slice(0, plan.targetDriverCount)) {
      await mockOperatorAdapter.respondToOffer(offer.id, 'Accepted')
    }

    const completed = (await mockOperatorAdapter.listCampaigns()).find((item) => item.id === campaign.id)
    const finalOffers = await mockOperatorAdapter.listOffers(campaign.id)
    expect(completed?.status).toBe('TargetReached')
    expect(finalOffers.filter((offer) => offer.status === 'Accepted')).toHaveLength(plan.targetDriverCount)
    expect(finalOffers.every((offer) => offer.status !== 'Open')).toBe(true)
  })

  it('replaces stale review proposals with a fresh Agent batch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T10:00:00+07:00'))
    await mockOperatorAdapter.resetDemo()
    const originalIds = (await mockOperatorAdapter.listPlans()).filter((plan) => plan.status === 'UnderReview').map((plan) => plan.id)

    vi.setSystemTime(new Date('2026-08-05T10:09:00+07:00'))
    const refreshed = await mockOperatorAdapter.listPlans()
    const freshIds = refreshed.filter((plan) => plan.status === 'UnderReview').map((plan) => plan.id)

    expect(freshIds).toHaveLength(3)
    expect(freshIds).not.toEqual(originalIds)
    expect(refreshed.filter((plan) => originalIds.includes(plan.id)).every((plan) => plan.status === 'Stale')).toBe(true)
    vi.useRealTimers()
  })
})
