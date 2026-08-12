export type ReviewDecision = 'APPROVED' | 'REJECTED';

export type ReviewIssue = {
  code: 'INVALID_INCENTIVE' | 'NO_MODEL_IMPROVEMENT' | 'POLICY_CHECK_FAILED' | 'PROPOSAL_VERSION_CONFLICT' | 'STALE_PROPOSAL';
  kind: 'conflict' | 'validation';
};

type OperationalProposal = {
  bonus_amount?: number | string | null;
  estimated_cost?: number | string | null;
  policy_status: string | null;
  simulation_details?: unknown;
  status: string;
  target_driver_count?: number | null;
  window_end_at: string | null;
};

export function proposalOperationalIssue(proposal: OperationalProposal): ReviewIssue | undefined {
  if (proposal.policy_status !== 'PASSED') {
    return { code: 'POLICY_CHECK_FAILED', kind: 'validation' };
  }
  if (Number(proposal.bonus_amount ?? 0) <= 0
    || Number(proposal.estimated_cost ?? 0) <= 0
    || Number(proposal.target_driver_count ?? 0) <= 0) {
    return { code: 'INVALID_INCENTIVE', kind: 'validation' };
  }
  const simulation = proposal.simulation_details && typeof proposal.simulation_details === 'object'
    ? proposal.simulation_details as Record<string, any>
    : {};
  const before = Number(simulation.metrics_before?.unmet_demand ?? 0);
  const afterMetrics = simulation.plan_mode === 'ACTIVATION_ONLY'
    ? simulation.metrics_after_activation_expected
    : simulation.metrics_after;
  const after = Number(afterMetrics?.unmet_demand ?? before);
  if (before > 0 && after >= before) {
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
  const operationalIssue = proposalOperationalIssue(proposal);
  if (operationalIssue) return operationalIssue;
  if (!proposal.window_end_at || new Date(proposal.window_end_at) < now) {
    return { code: 'STALE_PROPOSAL', kind: 'conflict' };
  }
  return undefined;
}
