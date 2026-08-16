import { proposalActivationIssue, proposalOperationalIssue, proposalReviewIssue } from './review-validation';

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
      generator_type: 'AGENT',
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
      generator_type: 'AGENT',
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

  it('requires model evidence and evaluates revised residuals instead of copied simulation metrics', () => {
    expect(proposalOperationalIssue({
      bonus_amount: 20_000,
      estimated_cost: 40_000,
      generator_type: 'AGENT',
      policy_status: 'PASSED',
      simulation_details: {},
      status: 'UNDER_REVIEW',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    })).toEqual({ code: 'MODEL_EVIDENCE_MISSING', kind: 'validation' });

    expect(proposalOperationalIssue({
      bonus_amount: 20_000,
      estimated_cost: 40_000,
      generator_type: 'AGENT',
      parent_proposal_id: 'parent-1',
      policy_status: 'PASSED',
      simulation_details: {
        metrics_before: { unmet_demand: 10 },
        metrics_after: { unmet_demand: 4 },
      },
      source_plan: { residual_gap: [{ zone_id: 2, gap_remaining: 10 }] },
      status: 'UNDER_REVIEW',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    })).toEqual({ code: 'NO_MODEL_IMPROVEMENT', kind: 'validation' });
  });

  it('approves a useful relocation without inventing an activation, but blocks activating it', () => {
    const relocationOnly = {
      bonus_amount: 0,
      estimated_cost: 0,
      generator_type: 'AGENT',
      policy_status: 'PASSED',
      simulation_details: {
        metrics_before: { unmet_demand: 10 },
        metrics_after_relocation: { unmet_demand: 0 },
        metrics_after_activation_expected: { unmet_demand: 0 },
      },
      source_plan: {
        moves: [{ from_zone: 6, to_zone: 2, units_to_move: 10 }],
        residual_gap: [],
      },
      status: 'UNDER_REVIEW',
      target_driver_count: 0,
      window_end_at: '2026-08-09T09:00:00.000Z',
    };

    expect(proposalOperationalIssue(relocationOnly)).toBeUndefined();
    expect(proposalActivationIssue(relocationOnly)).toEqual({ code: 'INVALID_INCENTIVE', kind: 'validation' });
  });

  it('requires a real residual target and incremental activation improvement', () => {
    const proposal = {
      bonus_amount: 20_000,
      estimated_cost: 100_000,
      generator_type: 'AGENT',
      policy_status: 'PASSED',
      simulation_details: {
        metrics_before: { unmet_demand: 10 },
        metrics_after_relocation: { unmet_demand: 4 },
        metrics_after_activation_expected: { unmet_demand: 2 },
      },
      source_plan: { moves: [], residual_gap: [] },
      status: 'APPROVED',
      target_driver_count: 2,
      window_end_at: '2026-08-09T09:00:00.000Z',
    };

    expect(proposalActivationIssue(proposal)).toEqual({ code: 'NO_ACTIVATION_TARGET', kind: 'validation' });
    expect(proposalActivationIssue({
      ...proposal,
      source_plan: { moves: [], residual_gap: [{ zone_id: 2, gap_remaining: 4 }] },
    })).toBeUndefined();
  });
});
