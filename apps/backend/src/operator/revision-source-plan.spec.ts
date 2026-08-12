import { buildRevisedSourcePlan } from './revision-source-plan';

describe('buildRevisedSourcePlan', () => {
  it('preserves model evidence and recalculates totals and residual gaps', () => {
    const result = buildRevisedSourcePlan({
      candidate_source_zones: [{ zone_id: 6, available_supply: 4, idle_supply_current: 12 }],
      moves: [{ id: 'MV-01', from_zone: 6, to_zone: 2, units_to_move: 4, estimated_cost: 16000, deadhead_km: 4.1, before_gap: 10, after_gap: 6, source_supply_after: 8 }],
      plan_totals: { budget_cap: 500000, total_cost: 16000, total_units: 4 },
      residual_gap: [{ zone_id: 2, gap_remaining: 6, suggested_activation: 6 }],
    }, [{ id: 'MV-01', from_zone: 6, to_zone: 2, drivers: 2 }], 300000);

    expect(result.candidate_source_zones).toEqual([{ zone_id: 6, available_supply: 4, idle_supply_current: 12 }]);
    expect(result.moves[0]).toMatchObject({
      after_gap: 8,
      before_gap: 10,
      drivers: 2,
      estimated_cost: 16000,
      source_supply_after: 10,
      units_to_move: 2,
    });
    expect(result.plan_totals).toMatchObject({ budget_cap: 300000, total_cost: 16000, total_units: 2 });
    expect(result.residual_gap).toEqual([{ zone_id: 2, gap_remaining: 8, suggested_activation: 8 }]);
    expect(result.warnings).toEqual([expect.objectContaining({
      code: 'PLAN_NOT_FULLY_COVERING_GAP',
      message: 'Còn 8 xe chưa được phủ sau điều chỉnh.',
    })]);
  });
});
