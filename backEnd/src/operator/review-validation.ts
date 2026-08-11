export type ReviewDecision = 'APPROVED' | 'REJECTED';

export type ReviewIssue = {
  code: 'POLICY_CHECK_FAILED' | 'PROPOSAL_VERSION_CONFLICT' | 'STALE_PROPOSAL';
  kind: 'conflict' | 'validation';
};

export function proposalReviewIssue(
  proposal: { policy_status: string | null; status: string; window_end_at: string | null },
  decision: ReviewDecision,
  now = new Date(),
): ReviewIssue | undefined {
  if (!['GENERATED', 'UNDER_REVIEW'].includes(proposal.status)) {
    return { code: 'PROPOSAL_VERSION_CONFLICT', kind: 'conflict' };
  }
  if (decision === 'REJECTED') return undefined;
  if (proposal.policy_status !== 'PASSED') {
    return { code: 'POLICY_CHECK_FAILED', kind: 'validation' };
  }
  if (!proposal.window_end_at || new Date(proposal.window_end_at) < now) {
    return { code: 'STALE_PROPOSAL', kind: 'conflict' };
  }
  return undefined;
}
