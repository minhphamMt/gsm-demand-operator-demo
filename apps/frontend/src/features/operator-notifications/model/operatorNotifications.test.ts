import { describe, expect, it } from 'vitest'

import { buildOperatorNotifications } from '@/features/operator-notifications/model/operatorNotifications'

describe('operator notifications', () => {
  it('routes proposal review notifications to the exact proposal', () => {
    const notifications = buildOperatorNotifications([{ id: 'proposal-1', status: 'UnderReview', title: 'Phương án 1' }], [], [])
    expect(notifications[0]).toMatchObject({ id: 'plan-proposal-1', path: '/operator/plans/proposal-1' })
  })

  it('derives operational campaign and expired-offer triggers from DB state', () => {
    const notifications = buildOperatorNotifications([], [{
      id: 'campaign-1', status: 'Active', accepted: 2, suggestedActivation: 5,
      candidateCount: 0, budgetLimit: 100, incentiveBudget: 85,
      expiresAt: '2026-08-09T12:04:00.000Z',
    }], [{ id: 'offer-1', status: 'Expired' }], new Date('2026-08-09T12:00:00.000Z'))

    expect(notifications.map((notification) => notification.id)).toEqual([
      'campaign-campaign-1-no-candidates',
      'campaign-campaign-1-budget-80',
      'campaign-campaign-1-expiring',
      'campaign-campaign-1-accepted-2',
      'offers-expired-1',
    ])
    expect(notifications.every((notification) => notification.path === '/operator/campaigns')).toBe(true)
  })

  it('reports terminal campaign state instead of live progress', () => {
    const notifications = buildOperatorNotifications([], [{
      id: 'campaign-2', status: 'TargetReached', accepted: 5, suggestedActivation: 5,
      candidateCount: 1, budgetLimit: 100, incentiveBudget: 90,
      expiresAt: '2026-08-09T12:04:00.000Z',
    }], [])
    expect(notifications).toEqual([{ id: 'campaign-campaign-2-target', message: 'campaign-2 đã đạt mục tiêu huy động.', path: '/operator/campaigns', tone: 'emerald' }])
  })
})
