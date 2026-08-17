import { describe, expect, it } from 'vitest'

import { isCampaignOverdue } from '@/features/operator-data/model/campaignState'

describe('campaign deadline presentation', () => {
  const expiresAt = '2026-08-17T10:10:00.000Z'

  it('flags an operational campaign after its deadline', () => {
    expect(isCampaignOverdue({ status: 'Running', expiresAt }, Date.parse('2026-08-17T10:11:00.000Z'))).toBe(true)
  })

  it('does not flag a campaign before its deadline or after it is terminal', () => {
    expect(isCampaignOverdue({ status: 'Running', expiresAt }, Date.parse('2026-08-17T10:09:00.000Z'))).toBe(false)
    expect(isCampaignOverdue({ status: 'Completed', expiresAt }, Date.parse('2026-08-17T10:11:00.000Z'))).toBe(false)
  })
})
