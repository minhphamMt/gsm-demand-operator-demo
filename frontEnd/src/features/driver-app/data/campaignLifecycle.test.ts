import { describe, expect, it } from 'vitest'

import { isCampaignActionable } from './campaignLifecycle'

const future = '2026-08-12T10:00:00Z'
const now = new Date('2026-08-12T09:00:00Z').getTime()

describe('isCampaignActionable', () => {
  it.each(['COMPLETED', 'CANCELLED', 'TARGET_REACHED'])(
    'does not advertise a terminal %s campaign',
    (status) => expect(isCampaignActionable({ status, start_at: null, end_at: future, reward_cutoff_at: null }, now)).toBe(false),
  )

  it('requires an active, non-expired operating window', () => {
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: null, end_at: future, reward_cutoff_at: null }, now)).toBe(true)
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: null, end_at: null, reward_cutoff_at: null }, now)).toBe(true)
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: null, end_at: '2026-08-12T08:00:00Z', reward_cutoff_at: null }, now)).toBe(false)
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: null, end_at: 'invalid', reward_cutoff_at: null }, now)).toBe(false)
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: '2026-08-12T09:30:00Z', end_at: future, reward_cutoff_at: null }, now)).toBe(false)
    expect(isCampaignActionable({ status: 'ACTIVE', start_at: null, end_at: future, reward_cutoff_at: '2026-08-12T08:30:00Z' }, now)).toBe(false)
  })
})
