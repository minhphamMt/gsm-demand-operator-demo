import { mapCampaign, mapDriver, mapOffer, mapProposal } from './operator.mapper';

describe('operator mappers', () => {
  it('maps proposal snake_case fields to frontend contract', () => {
    const mapped = mapProposal({
      id: 'p1',
      status: 'GENERATED',
      generator_type: 'RULE_BASED',
      target_h3_indexes: ['8928308280fffff'],
      target_driver_count: 5,
      bonus_amount: '50000',
      fare_multiplier: '1.2',
      window_end_at: '2026-08-09T17:00:00.000Z',
      source_plan: { moves: [{ from_h3: 'source', to_h3: 'target', drivers: 3 }] },
      simulation_details: {
        confidence: 0.8,
        metrics_before: { gap: 12, eta_p50_min: 11 },
        metrics_after: { gap: 4, eta_p50_min: 6 },
      },
    });
    expect(mapped.status).toBe('Generated');
    expect(mapped.targetZoneId).toBe('8928308280fffff');
    expect(mapped.relocationBonus).toBe(50000);
    expect(mapped.moves).toHaveLength(1);
    expect(mapped.moves[0]).toMatchObject({ sourceZoneId: 'source', targetZoneId: 'target', quantity: 3 });
    expect(mapped.metricsBefore).toMatchObject({ residualGap: 12, avgWaitProxy: 11 });
    expect(mapped.metrics).toMatchObject({ residualGap: 4, avgWaitProxy: 6 });
    expect(mapped.confidence).toBe(0.8);
    expect(mapped.simulationAvailable).toBe(true);
    expect(mapped.inputFreshUntil).toBe('2026-08-09T17:00:00.000Z');
  });

  it('does not invent confidence or simulation availability for manual DB proposals', () => {
    const mapped = mapProposal({ id: 'p-manual', generator_type: 'MANUAL', status: 'APPROVED' });

    expect(mapped.confidence).toBeNull();
    expect(mapped.simulationAvailable).toBe(false);
  });

  it('maps the origin/AI relocation contract without losing zone, move, metric, or warning fields', () => {
    const mapped = mapProposal({
      id: 'ai-p1',
      status: 'UNDER_REVIEW',
      generator_type: 'AGENT',
      source_plan: {
        moves: [{
          from_zone: 6,
          to_zone: 2,
          units_to_move: 4,
          eta_steps: 3,
          estimated_distance_km: 5.2,
          estimated_cost: 80000,
          after_gap: 6,
        }],
        residual_gap: [{ zone_id: 2, gap_remaining: 6, suggested_activation: 6 }],
        plan_totals: { total_cost: 80000, budget_cap: 500000 },
        warnings: [{ code: 'PLAN_NOT_FULLY_COVERING_GAP', message: 'Còn thiếu 6 xe.' }],
      },
      simulation_details: {
        metrics_before: { unmet_demand: 10, avg_wait_proxy: 8 },
        metrics_after: { unmet_demand: 6, avg_wait_proxy: 5 },
      },
    });

    expect(mapped.targetZoneId).toBe('zone-02');
    expect(mapped.targetZoneLabel).toBe('Hoàn Kiếm');
    expect(mapped.moves[0]).toMatchObject({
      sourceZoneId: 'zone-06',
      sourceZoneLabel: 'Cầu Giấy',
      targetZoneId: 'zone-02',
      targetZoneLabel: 'Hoàn Kiếm',
      quantity: 4,
      etaMinutes: 15,
    });
    expect(mapped.metrics).toMatchObject({ residualGap: 6, avgWaitProxy: 5 });
    expect(mapped.budgetLimit).toBe(500000);
    expect(mapped.estimatedRewardCost).toBe(80000);
    expect(mapped.warnings[0]).toMatchObject({
      id: 'PLAN_NOT_FULLY_COVERING_GAP',
      detail: 'Còn thiếu 6 xe.',
    });
  });

  it('maps offers and drivers', () => {
    expect(mapOffer({ distance_m: 1500, eta_seconds: 121, campaigns: {} }).etaMinutes).toBe(3);
    expect(mapDriver({ driver_id: 'd1', is_online: true, operational_status: 'ON_TRIP' }).status).toBe('on_trip');
    expect(mapOffer({ status: 'VIEWED', campaigns: {} }).status).toBe('Open');
  });

  it('aggregates campaign funnel', () => {
    const result = mapCampaign(
      { id: 'c1', status: 'ACTIVE', target_driver_count: 2, batch_size: 0, bonus_amount: 100 },
      [{ campaign_id: 'c1', status: 'ACCEPTED', sent_at: '2026-01-01' }],
      [{ campaign_id: 'c1', status: 'EN_ROUTE' }],
    );
    expect(result.accepted).toBe(1);
    expect(result.status).toBe('Active');
    expect(result.suggestedActivation).toBe(2);
    expect(result.enRoute).toBe(1);
    expect(result.worstCaseCommitment).toBe(200);
  });

  it('counts participations released by campaign cancellation', () => {
    const result = mapCampaign(
      { id: 'c1', status: 'CANCELLED', target_driver_count: 2, bonus_amount: 100 },
      [{ campaign_id: 'c1', status: 'EXPIRED', sent_at: '2026-01-01' }],
      [{ campaign_id: 'c1', status: 'CANCELLED' }],
    );
    expect(result.status).toBe('Cancelled');
    expect(result.expired).toBe(1);
    expect(result.cancelled).toBe(1);
  });
});
