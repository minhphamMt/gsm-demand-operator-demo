import { proposalOperationalIssue, proposalReviewIssue } from './review-validation';

describe('proposalReviewIssue', () => {
  const now = new Date('2026-08-09T08:30:00.000Z');

  it('blocks stale and policy-failed approvals', () => {
    expect(proposalReviewIssue({
      bonus_amount: 20_000, estimated_cost: 40_000, policy_status: 'PASSED', status: 'UNDER_REVIEW', target_driver_count: 2, window_end_at: '2026-08-09T08:29:59.000Z',
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

  it('allows model-backed activation-only proposals and blocks zero-impact or zero-incentive proposals', () => {
    expect(proposalOperationalIssue({
      bonus_amount: 20_000,
      estimated_cost: 40_000,
      policy_status: 'PASSED',
      simulation_details: {
        plan_mode: 'ACTIVATION_ONLY',
        metrics_before: { unmet_demand: 10 },
        metrics_after: { unmet_demand: 10 },
        metrics_after_activation_expected: { unmet_demand: 8 },
      },
      status: 'UNDER_REVIEW',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    })).toBeUndefined();
    expect(proposalOperationalIssue({
      bonus_amount: 20_000,
      estimated_cost: 40_000,
      policy_status: 'PASSED',
      simulation_details: { metrics_before: { unmet_demand: 10 }, metrics_after: { unmet_demand: 10 } },
      status: 'UNDER_REVIEW',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    })).toEqual({ code: 'NO_MODEL_IMPROVEMENT', kind: 'validation' });
    expect(proposalOperationalIssue({
      bonus_amount: null,
      estimated_cost: 0,
      policy_status: 'PASSED',
      status: 'APPROVED',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    })).toEqual({ code: 'INVALID_INCENTIVE', kind: 'validation' });
  });
});
