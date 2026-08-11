import { proposalReviewIssue } from './review-validation';

describe('proposalReviewIssue', () => {
  const now = new Date('2026-08-09T08:30:00.000Z');

  it('blocks stale and policy-failed approvals', () => {
    expect(proposalReviewIssue({
      policy_status: 'PASSED', status: 'UNDER_REVIEW', window_end_at: '2026-08-09T08:29:59.000Z',
    }, 'APPROVED', now)).toEqual({ code: 'STALE_PROPOSAL', kind: 'conflict' });
    expect(proposalReviewIssue({
      policy_status: 'FAILED', status: 'UNDER_REVIEW', window_end_at: '2026-08-09T09:00:00.000Z',
    }, 'APPROVED', now)).toEqual({ code: 'POLICY_CHECK_FAILED', kind: 'validation' });
  });

  it('allows a reasoned rejection even when policy failed', () => {
    expect(proposalReviewIssue({
      policy_status: 'FAILED', status: 'UNDER_REVIEW', window_end_at: '2026-08-09T08:00:00.000Z',
    }, 'REJECTED', now)).toBeUndefined();
  });

  it('treats an already-reviewed proposal as a concurrency conflict', () => {
    expect(proposalReviewIssue({
      policy_status: 'PASSED', status: 'APPROVED', window_end_at: '2026-08-09T09:00:00.000Z',
    }, 'APPROVED', now)).toEqual({ code: 'PROPOSAL_VERSION_CONFLICT', kind: 'conflict' });
  });
});
