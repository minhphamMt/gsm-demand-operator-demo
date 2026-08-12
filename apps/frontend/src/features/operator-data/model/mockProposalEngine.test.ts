import { describe, expect, it } from 'vitest'

import { createAgentPlans, reviseAgentPlan } from '@/features/operator-data/model/mockProposalEngine'

describe('mock proposal review engine', () => {
  it('generates three comparable strategies from one snapshot contract', () => {
    const proposals = createAgentPlans('rain-peak')
    expect(proposals).toHaveLength(3)
    expect(new Set(proposals.map((proposal) => proposal.inputSnapshotId)).size).toBe(1)
    expect(proposals.map((proposal) => proposal.rank)).toEqual([1, 2, 3])
    expect(proposals.every((proposal) => proposal.generatorType === 'AGENT' && proposal.policyChecks.every((check) => check.passed))).toBe(true)
    expect(proposals[0]!.metrics.residualGap).toBeLessThan(proposals[0]!.metricsBefore.residualGap)
    expect(proposals.map((proposal) => proposal.estimatedRewardCost)).toEqual([600_000, 400_000, 205_000])
    expect(proposals.map((proposal) => proposal.estimatedNetCost)).toEqual([600_000, 370_250, 162_500])
  })

  it('re-simulates impact, economics and policy after an operator revision', () => {
    const plan = createAgentPlans('rain-peak')[0]!
    const revised = reviseAgentPlan(plan, {
      moveQuantities: Object.fromEntries(plan.moves.map((move) => [move.id, 1])),
      moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, 'AI-Z04'])),
      targetDriverCount: 12,
      campaignDurationMinutes: 45,
      relocationBonus: 120_000,
      zoneTripBonus: 30_000,
      fareMultiplier: 1.2,
      budgetLimit: 500_000,
      note: 'Kiểm tra trường hợp ngân sách không đạt',
    })

    expect(revised.status).toBe('Revised')
    expect(revised.version).toBe(2)
    expect(revised.metrics.residualGap).toBeGreaterThan(plan.metrics.residualGap)
    expect(revised.policyChecks.find((check) => check.id === 'POL-BUDGET')?.passed).toBe(false)
    expect(revised.explanation.at(-1)).toContain('Kiểm tra trường hợp ngân sách không đạt')
  })

  it('blocks a revision that drains one source through multiple moves', () => {
    const plan = createAgentPlans('rain-peak')[0]!
    const revised = reviseAgentPlan(plan, {
      moveQuantities: Object.fromEntries(plan.moves.map((move) => [move.id, 5])),
      moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, 'AI-Z04'])),
      targetDriverCount: plan.targetDriverCount,
      campaignDurationMinutes: plan.campaignDurationMinutes,
      relocationBonus: plan.relocationBonus,
      zoneTripBonus: plan.zoneTripBonus,
      fareMultiplier: plan.fareMultiplier,
      budgetLimit: plan.budgetLimit,
      note: 'Dồn hai lệnh vào cùng vùng nguồn',
    })

    expect(revised.policyChecks.find((check) => check.id === 'POL-SOURCE')?.passed).toBe(false)
  })
})
