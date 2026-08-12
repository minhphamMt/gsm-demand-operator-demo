import type { Proposal } from '@/features/operator-data'

import type { OperatorWorkflowStage } from './operatorWorkflow'

export function proposalCoverageForStage(
  plan: Proposal | undefined,
  stage: OperatorWorkflowStage,
) {
  if (!plan) return { label: 'MỨC PHỦ PHƯƠNG ÁN', percent: 0 } as const

  const usesExpectedActivation = Boolean(plan.metricsAfterActivation) && (
    stage === 'activation_draft'
    || stage === 'campaign'
    || (stage === 'approved' && plan.moves.length === 0)
  )
  const metrics = usesExpectedActivation
    ? plan.metricsAfterActivation!
    : plan.metrics
  const percent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (1 - metrics.residualGap / Math.max(1, plan.metricsBefore.residualGap)) * 100,
      ),
    ),
  )

  return {
    label: usesExpectedActivation ? 'MỨC PHỦ KỲ VỌNG' : 'MỨC PHỦ ĐIỀU CHUYỂN',
    percent,
  } as const
}
