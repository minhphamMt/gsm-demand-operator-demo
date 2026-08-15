import type { ScenarioComparison } from '@/features/operator-data'

type ScenarioResult = ScenarioComparison['scenarios'][number]

export type ScenarioMetricSummary = {
  fulfillmentRate: number | null
  unmetDemand: number | null
}

function numericMetric(metrics: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metrics[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export function scenarioMetricSummary(scenario: ScenarioResult): ScenarioMetricSummary {
  const rawRate = numericMetric(scenario.estimatedMetrics, 'fulfillment_rate', 'fulfillmentRate')
  return {
    fulfillmentRate: rawRate === null ? null : rawRate <= 1 ? rawRate * 100 : rawRate,
    unmetDemand: numericMetric(scenario.estimatedMetrics, 'unmet_demand', 'residual_gap', 'residualGap'),
  }
}

export function recommendedScenarioType(scenarios: readonly ScenarioResult[]) {
  const ranked = scenarios
    .map((scenario) => ({ scenario, summary: scenarioMetricSummary(scenario) }))
    .filter((candidate) => candidate.summary.unmetDemand !== null)
    .sort((left, right) => (left.summary.unmetDemand ?? Infinity) - (right.summary.unmetDemand ?? Infinity))
  return ranked[0]?.scenario.type
}
