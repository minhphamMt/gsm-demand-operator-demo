import { describe, expect, it } from 'vitest'

import type { ScenarioComparison } from '@/features/operator-data'
import { recommendedScenarioType, scenarioMetricSummary } from './scenarioMetricPresentation'

const scenario = (type: ScenarioComparison['scenarios'][number]['type'], unmetDemand: number, fulfillmentRate: number) => ({
  type,
  estimatedMetrics: { fulfillment_rate: fulfillmentRate, unmet_demand: unmetDemand },
  observedMetrics: null,
  uncertainty: {},
  responseSource: 'test',
})

describe('scenario metric presentation', () => {
  it('normalizes ratio-based fulfillment for visual display', () => {
    expect(scenarioMetricSummary(scenario('RELOCATION', 4, 0.92))).toEqual({ fulfillmentRate: 92, unmetDemand: 4 })
  })

  it('recommends the scenario with the smallest remaining gap', () => {
    expect(recommendedScenarioType([scenario('NO_ACTION', 12, 0.8), scenario('HYBRID', 2, 0.97)])).toBe('HYBRID')
  })
})
