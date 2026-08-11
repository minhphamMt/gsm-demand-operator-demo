import { describe, expect, it } from 'vitest'

import type { Proposal } from '@/features/operator-data'
import { selectAiProposal } from '@/features/operator-dashboard/model/selectAiProposal'

const proposal = (overrides: Partial<Proposal>): Proposal => ({
  id: 'p1', rootProposalId: 'p1', parentProposalId: null, title: 'AI plan', status: 'UnderReview', createdAt: '2026-08-11T10:00:00Z', version: 1, rank: 1,
  scenarioId: 'rain-peak', generatorType: 'AGENT', generatorVersion: 'v1', inputSnapshotId: 's1', hotspotId: 'h1', targetZoneId: 'zone-02', targetZoneLabel: 'Hoàn Kiếm', confidence: null,
  simulationAvailable: true, candidateSourceZones: [], moves: [], targetDriverCount: 0, expectedOfferCount: 0, eligibleDriverCount: 0, averageDistanceKm: 0, averageEtaMinutes: 0,
  campaignDurationMinutes: 0, relocationBonus: 0, zoneTripBonus: 0, fareMultiplier: 1, budgetLimit: 0, estimatedRewardCost: 0, estimatedAdditionalRevenue: 0, estimatedNetCost: 0,
  policyChecks: [], warnings: [], metricsBefore: { fulfillmentRate: 0, residualGap: 0, deadheadKm: 0, budget: 0, expectedTrips: 0, avgWaitProxy: 0 }, metrics: { fulfillmentRate: 0, residualGap: 0, deadheadKm: 0, budget: 0, expectedTrips: 0, avgWaitProxy: 0 }, explanation: [], inputFreshUntil: '2026-08-11T10:10:00Z',
  ...overrides,
})

describe('selectAiProposal', () => {
  it('selects the highest-ranked reviewable AGENT proposal only', () => {
    expect(selectAiProposal([
      proposal({ id: 'approved', status: 'Approved', rank: 1 }),
      proposal({ id: 'rule', generatorType: 'RULE_BASED', rank: 1 }),
      proposal({ id: 'second', rank: 2 }),
      proposal({ id: 'first', rank: 1 }),
    ])?.id).toBe('first')
  })
})
