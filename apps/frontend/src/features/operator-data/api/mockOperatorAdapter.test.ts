import { describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

describe('mock operator adapter', () => {
  it('re-simulates a revision, records approval flow, then cancels activation safely', async () => {
    await mockOperatorAdapter.resetDemo()
    const plan = await mockOperatorAdapter.getPlan('PLN-042')
    if (!plan) throw new Error('Missing proposal fixture')
    const revised = await mockOperatorAdapter.revisePlan('PLN-042', { expectedVersion: plan.version, moveQuantities: Object.fromEntries(plan.moves.map((move) => [move.id, move.id === 'MOV-01' ? 0 : move.quantity])), moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, move.sourceZoneId])), targetDriverCount: plan.targetDriverCount, campaignDurationMinutes: plan.campaignDurationMinutes, relocationBonus: plan.relocationBonus, zoneTripBonus: plan.zoneTripBonus, fareMultiplier: plan.fareMultiplier, budgetLimit: plan.budgetLimit, note: 'Giảm điều chuyển từ Cầu Giấy' })
    expect(revised.moves.some((move) => move.id === 'MOV-01')).toBe(false)
    expect(revised.version).toBe(2)

    expect(revised.id).not.toBe('PLN-042')
    expect((await mockOperatorAdapter.getPlan('PLN-042'))?.status).toBe('Stale')

    const approved = await mockOperatorAdapter.approvePlan(revised.id, revised.version)
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

  it('keeps a cancelled campaign after the mock adapter is reloaded', async () => {
    await mockOperatorAdapter.resetDemo()
    await mockOperatorAdapter.cancelCampaign('CMP-017')

    const stored = JSON.parse(window.localStorage.getItem('novafour.operator.mock-state.v1') ?? '{}') as {
      campaigns?: Array<{ id: string; status: string }>
      offers?: Array<{ campaignId: string; status: string }>
    }
    expect(stored.campaigns?.find((campaign) => campaign.id === 'CMP-017')?.status).toBe('Cancelled')
    expect(stored.offers?.filter((offer) => offer.campaignId === 'CMP-017').every((offer) => offer.status !== 'Open')).toBe(true)

    vi.resetModules()
    const reloaded = await import('@/features/operator-data/api/mockOperatorAdapter')
    const offersAfterReload = await reloaded.mockOperatorAdapter.listOffers('CMP-017')
    expect(offersAfterReload.every((offer) => offer.status !== 'Open')).toBe(true)

    await reloaded.mockOperatorAdapter.resetDemo()
  })

  it('closes remaining offers when the acceptance target is reached', async () => {
    await mockOperatorAdapter.resetDemo()
    const original = await mockOperatorAdapter.getPlan('PLN-042')
    if (!original) throw new Error('Missing proposal fixture')
    const revised = await mockOperatorAdapter.revisePlan(original.id, {
      expectedVersion: original.version,
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
    const plan = await mockOperatorAdapter.approvePlan(revised.id, revised.version)
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

  it('stales an approved proposal after its unused execution window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T10:00:00+07:00'))
    await mockOperatorAdapter.resetDemo()
    const original = await mockOperatorAdapter.getPlan('PLN-042')
    if (!original) throw new Error('Missing proposal fixture')
    const revised = await mockOperatorAdapter.revisePlan(original.id, {
      expectedVersion: original.version,
      moveQuantities: Object.fromEntries(original.moves.map((move) => [move.id, move.quantity])),
      moveSourceZoneIds: Object.fromEntries(original.moves.map((move) => [move.id, move.sourceZoneId])),
      targetDriverCount: original.targetDriverCount,
      campaignDurationMinutes: 5,
      relocationBonus: original.relocationBonus,
      zoneTripBonus: original.zoneTripBonus,
      fareMultiplier: original.fareMultiplier,
      budgetLimit: original.budgetLimit,
      note: 'Kiá»ƒm thá»­ proposal Ä‘Ã£ duyá»‡t háº¿t háº¡n',
    })
    await mockOperatorAdapter.approvePlan(revised.id, revised.version)

    vi.setSystemTime(new Date('2026-08-05T10:09:00+07:00'))

    expect((await mockOperatorAdapter.getPlan(revised.id))?.status).toBe('Stale')
    vi.useRealTimers()
  })
})

describe('snapshot mang bucket replay', () => {
  // `sourceAt` thiếu thì console rơi về `generatedAt` — mốc đồng hồ thật — rồi đưa nó vào
  // `observedAtForReplaySource()`, vốn chỉ nhận bucket. Trộn hai loại mốc cho ra thời gian vô
  // nghĩa: đo thật thấy "Đang xem" nhảy từ 17:00 sang 01:31 ngay sau khi chạy dự báo, rail báo
  // "Snapshot đã cũ", và `tính phương án` không bao giờ chạy được trong bản mock.
  const laBucket5Phut = (at: string | undefined) => {
    expect(at).toBeDefined()
    const moc = new Date(at!)
    expect(Number.isNaN(moc.getTime())).toBe(false)
    expect(moc.getSeconds()).toBe(0)
    expect(moc.getMilliseconds()).toBe(0)
    expect(moc.getMinutes() % 5).toBe(0)
    // Và nó phải là bucket HIỆN TẠI, không phải một mốc cũ trong bộ seed.
    expect(Date.now() - moc.getTime()).toBeLessThan(6 * 60_000)
  }

  it('snapshot nền biết mình thuộc bucket nào', async () => {
    laBucket5Phut((await mockOperatorAdapter.getSnapshot('baseline')).sourceAt)
  })

  it('dự báo cũng vậy — đây là chỗ đã hỏng', async () => {
    laBucket5Phut((await mockOperatorAdapter.generateAiDecision(1, 15)).sourceAt)
  })

  it('runReplayStep vẫn ghi đè bằng bucket được yêu cầu', async () => {
    const bucket = '2026-08-31T10:00:00.000Z'

    expect((await mockOperatorAdapter.runReplayStep(bucket)).sourceAt).toBe(bucket)
  })

  it('thay đổi dữ liệu mô phỏng theo từng bucket thay vì chỉ đổi nhãn thời gian', async () => {
    const first = await mockOperatorAdapter.runReplayStep('2026-09-25T08:30:00+07:00')
    const second = await mockOperatorAdapter.runReplayStep('2026-09-25T08:35:00+07:00')

    expect(second.sourceAt).not.toBe(first.sourceAt)
    expect(second.replayStep).not.toBe(first.replayStep)
    expect(second.zones).not.toEqual(first.zones)
  })
})
