export type ReviewDecision = 'APPROVED' | 'REJECTED';

export type ReviewIssue = {
  code: 'INVALID_INCENTIVE' | 'MODEL_EVIDENCE_MISSING' | 'NO_ACTIVATION_TARGET' | 'NO_MODEL_IMPROVEMENT' | 'POLICY_CHECK_FAILED' | 'PROPOSAL_VERSION_CONFLICT' | 'STALE_PROPOSAL';
  kind: 'conflict' | 'validation';
};

type OperationalProposal = {
  bonus_amount?: number | string | null;
  estimated_cost?: number | string | null;
  generator_type?: string | null;
  parent_proposal_id?: string | null;
  policy_status: string | null;
  simulation_details?: unknown;
  source_plan?: unknown;
  status: string;
  target_driver_count?: number | null;
  window_end_at: string | null;
};

const record = (value: unknown): Record<string, any> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;

function unmetMetric(value: unknown) {
  const metric = record(value);
  const raw = metric?.unmet_demand ?? metric?.gap ?? metric?.residual_gap;
  const parsed = Number(raw);
  return raw !== null && raw !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function directMoveCount(sourcePlan: Record<string, any> | undefined) {
  return Array.isArray(sourcePlan?.moves)
    ? sourcePlan.moves.filter((move: unknown) => {
        const value = record(move);
        return Number(value?.drivers ?? value?.units_to_move ?? value?.quantity ?? 0) > 0;
      }).length
    : 0;
}

function residualGap(sourcePlan: Record<string, any> | undefined) {
  return Array.isArray(sourcePlan?.residual_gap)
    ? sourcePlan.residual_gap.reduce((sum: number, value: unknown) => {
        const row = record(value);
        return sum + Math.max(0, Number(row?.gap_remaining ?? row?.gapRemaining ?? 0));
      }, 0)
    : null;
}

export function proposalOperationalIssue(proposal: OperationalProposal): ReviewIssue | undefined {
  if (proposal.policy_status !== 'PASSED') {
    return { code: 'POLICY_CHECK_FAILED', kind: 'validation' };
  }
  const simulation = record(proposal.simulation_details) ?? {};
  const before = unmetMetric(simulation.metrics_before ?? simulation.metricsBefore);
  const sourcePlan = record(proposal.source_plan);
  const hasDirectMoves = directMoveCount(sourcePlan) > 0;
  const revisedResidual = proposal.parent_proposal_id ? residualGap(sourcePlan) : null;
  const afterMetrics = simulation.plan_mode === 'ACTIVATION_ONLY'
    ? simulation.metrics_after_activation_expected
    : simulation.metrics_after_relocation ?? simulation.metrics_after ?? simulation.metricsAfter;
  const after = revisedResidual ?? unmetMetric(afterMetrics);
  if (['AGENT', 'RULE_BASED'].includes(String(proposal.generator_type ?? ''))
    && (before === null || after === null)) {
    return { code: 'MODEL_EVIDENCE_MISSING', kind: 'validation' };
  }
  if (before !== null && after !== null && (before <= 0 || after >= before)) {
    return { code: 'NO_MODEL_IMPROVEMENT', kind: 'validation' };
  }
  if (!hasDirectMoves && (Number(proposal.bonus_amount ?? 0) <= 0
    || Number(proposal.estimated_cost ?? 0) <= 0
    || Number(proposal.target_driver_count ?? 0) <= 0)) {
    return { code: 'INVALID_INCENTIVE', kind: 'validation' };
  }
  return undefined;
}

export function proposalActivationIssue(proposal: OperationalProposal): ReviewIssue | undefined {
  if (proposal.policy_status !== 'PASSED') {
    return { code: 'POLICY_CHECK_FAILED', kind: 'validation' };
  }
  if (Number(proposal.bonus_amount ?? 0) <= 0
    || Number(proposal.estimated_cost ?? 0) <= 0
    || Number(proposal.target_driver_count ?? 0) <= 0) {
    return { code: 'INVALID_INCENTIVE', kind: 'validation' };
  }
  const sourcePlan = record(proposal.source_plan);
  if ((residualGap(sourcePlan) ?? 0) <= 0) {
    return { code: 'NO_ACTIVATION_TARGET', kind: 'validation' };
  }
  const simulation = record(proposal.simulation_details) ?? {};
  const relocation = unmetMetric(simulation.metrics_after_relocation ?? simulation.metrics_after);
  const activation = unmetMetric(simulation.metrics_after_activation_expected);
  if (relocation === null || activation === null) {
    return { code: 'MODEL_EVIDENCE_MISSING', kind: 'validation' };
  }
  if (activation >= relocation) {
    return { code: 'NO_MODEL_IMPROVEMENT', kind: 'validation' };
  }
  return undefined;
}

export function proposalReviewIssue(
  proposal: OperationalProposal,
  decision: ReviewDecision,
  now = new Date(),
): ReviewIssue | undefined {
  if (!['GENERATED', 'UNDER_REVIEW'].includes(proposal.status)) {
    return { code: 'PROPOSAL_VERSION_CONFLICT', kind: 'conflict' };
  }
  if (decision === 'REJECTED') return undefined;
  if (!proposal.window_end_at || new Date(proposal.window_end_at) < now) {
    return { code: 'STALE_PROPOSAL', kind: 'conflict' };
  }
  const operationalIssue = proposalOperationalIssue(proposal);
  if (operationalIssue) return operationalIssue;
  return undefined;
}
