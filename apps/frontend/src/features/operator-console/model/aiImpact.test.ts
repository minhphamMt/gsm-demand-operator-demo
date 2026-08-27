import { describe, expect, it } from 'vitest'

import type { Proposal, SimulationMetrics } from '@/features/operator-data'
import { aiImpactOf } from './aiImpact'

const metrics = (residualGap: number, fulfillmentRate = 80): SimulationMetrics => ({
  avgWaitProxy: 6, budget: 0, deadheadKm: 0, expectedTrips: 0, fulfillmentRate, residualGap,
})

const plan = (fields: Partial<Proposal>): Proposal => ({
  metricsBefore: metrics(66), metrics: metrics(31), ...fields,
} as Proposal)

describe('aiImpactOf', () => {
  it('has nothing to compare before a plan exists', () => {
    expect(aiImpactOf(undefined)).toBeUndefined()
  })

  it('lines up the three scenarios in the order the pipeline produces them', () => {
    const impact = aiImpactOf(plan({
      metricsBefore: metrics(66), metricsAfterRelocation: metrics(31), metricsAfterActivation: metrics(12),
    }))

    expect(impact?.scenarios.map((scenario) => [scenario.id, scenario.residualGap])).toEqual([
      ['no_action', 66], ['plan_only', 31], ['plan_activation', 12],
    ])
    expect(impact?.gapClosed).toBe(54)
    expect(impact?.gapClosedPct).toBe(82)
  })

  // Kịch bản kích hoạt dựa trên giả định tỷ lệ nhận (C-07) nên phải gắn nhãn kỳ vọng;
  // hai kịch bản kia là kết quả Simulator.
  it('marks only the activation scenario as projected', () => {
    const impact = aiImpactOf(plan({
      metricsBefore: metrics(66), metricsAfterRelocation: metrics(31), metricsAfterActivation: metrics(12),
    }))

    expect(impact?.scenarios.map((scenario) => scenario.isProjected)).toEqual([false, false, true])
  })

  it('shows two scenarios when activation was never simulated, without inventing a third', () => {
    const impact = aiImpactOf(plan({ metricsBefore: metrics(66), metricsAfterRelocation: metrics(40) }))

    expect(impact?.scenarios.map((scenario) => scenario.id)).toEqual(['no_action', 'plan_only'])
    expect(impact?.gapClosed).toBe(26)
  })

  it('never reports a negative saving when a plan makes the gap worse', () => {
    const impact = aiImpactOf(plan({ metricsBefore: metrics(20), metricsAfterRelocation: metrics(35) }))

    expect(impact?.gapClosed).toBe(0)
    expect(impact?.gapClosedPct).toBe(0)
  })

  it('stays at zero percent instead of dividing by an empty baseline', () => {
    const impact = aiImpactOf(plan({ metricsBefore: metrics(0), metricsAfterRelocation: metrics(0) }))

    expect(impact?.gapClosedPct).toBe(0)
  })
})
