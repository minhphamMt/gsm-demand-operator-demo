import { describe, expect, it } from 'vitest'

import { isCampaign, isOperationsReport, isProposal, isSnapshot, parseEntities } from '@/features/operator-data/api/responseGuards'

describe('API response guards', () => {
  it('accepts the live campaign contract', () => {
    expect(isCampaign({ id: 'c1', planId: 'p1', status: 'Active', offersSent: 2, accepted: 1 })).toBe(true)
  })

  it('rejects WKB-like geometry at the snapshot boundary', () => {
    expect(isSnapshot({ generatedAt: '2026-08-09T00:00:00Z', scenario: 'baseline', zones: [{ id: 'h3', center: '0101', boundary: [] }], hotspots: [], kpis: {} })).toBe(false)
  })

  it('rejects malformed arrays', () => {
    expect(() => parseEntities([{ id: 'missing fields' }], isCampaign, 'campaign')).toThrow('không hợp lệ')
  })

  it('accepts historical DB proposals without a target zone', () => {
    expect(isProposal({ confidence: null, id: 'p1', moves: [], policyChecks: [], simulationAvailable: false, status: 'Approved', targetZoneId: null, title: 'Historical proposal' })).toBe(true)
  })

  it('accepts a DB-ledger report only when net cost is explicitly unavailable', () => {
    expect(isOperationsReport({ generatedAt: '2026-08-09T00:00:00Z', dataMode: 'DB_LEDGER', summary: { campaigns: 1, qualifiedTrips: 2 }, campaigns: [{ id: 'c1', budgetUsedVnd: 10 }], sources: { netCostVnd: null } })).toBe(true)
    expect(isOperationsReport({ generatedAt: '2026-08-09T00:00:00Z', dataMode: 'DB_LEDGER', summary: { campaigns: 1, qualifiedTrips: 2 }, campaigns: [], sources: { netCostVnd: 'estimated' } })).toBe(false)
  })
})
