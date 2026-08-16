import type { AiSnapshotStatus, Proposal } from '@/features/operator-data'

export type DecisionEvidence = {
  label: string
  value: string
  state: 'ready' | 'warning' | 'unknown'
}

export type DecisionReadiness = {
  evidence: readonly DecisionEvidence[]
  weakestFactor: string
  canGenerate: boolean
}

export function getDecisionReadiness(ai: AiSnapshotStatus | undefined, plan: Proposal | undefined): DecisionReadiness {
  const registeredZones = ai?.registeredZones ?? 0
  const liveZones = ai?.liveZones ?? 0
  const forecastedZones = ai?.forecastedZones ?? 0
  const passedPolicies = plan?.policyChecks.filter((check) => check.passed).length ?? 0
  const policyCount = plan?.policyChecks.length ?? 0

  const evidence: DecisionEvidence[] = [
    {
      label: 'Dữ liệu zone',
      value: `${liveZones}/${registeredZones || 30}`,
      state: liveZones === 30 && registeredZones === 30 ? 'ready' : 'warning',
    },
    {
      label: 'Có dự báo',
      value: `${forecastedZones}/${registeredZones || 30}`,
      state: forecastedZones === 30 && registeredZones === 30 ? 'ready' : forecastedZones > 0 ? 'warning' : 'unknown',
    },
    {
      label: 'Policy đạt',
      value: policyCount > 0 ? `${passedPolicies}/${policyCount}` : 'Chưa kiểm',
      state: policyCount === 0 ? 'unknown' : passedPolicies === policyCount ? 'ready' : 'warning',
    },
  ]

  const weakest = evidence.find((item) => item.state === 'warning') ?? evidence.find((item) => item.state === 'unknown')
  return {
    evidence,
    weakestFactor: weakest ? weakest.label : 'Không có cảnh báo dữ liệu',
    canGenerate: registeredZones === 30 && liveZones === 30,
  }
}
