import { revisionFieldErrors } from './revision-validation';

describe('revisionFieldErrors', () => {
  it('returns source-supply and budget errors by AI zone field', () => {
    const errors = revisionFieldErrors({
      budgetLimit: 100000,
      currentSourcePlan: {
        candidate_source_zones: [{ zone_id: 6, available_supply: 3 }],
        moves: [{ from_zone: 6, to_zone: 2, estimated_cost: 60000 }, { from_zone: 6, to_zone: 3, estimated_cost: 60000 }],
      },
      moves: [{ from_zone: 6, to_zone: 2, drivers: 2 }, { from_zone: 6, to_zone: 3, drivers: 2 }],
      relocationBonus: 50000,
      targetDriverCount: 3,
    });

    expect(errors).toEqual({
      'sourcePlan.moves.0.drivers': 'Tổng số xe lấy từ zone nguồn không được vượt quá 3.',
      'sourcePlan.moves.1.drivers': 'Tổng số xe lấy từ zone nguồn không được vượt quá 3.',
      budgetLimit: 'Hạn mức điều chuyển phải ít nhất bằng chi phí model 120000 VND.',
    });
  });

  it('accepts a revision within source and budget limits', () => {
    expect(revisionFieldErrors({
      budgetLimit: 150000,
      currentSourcePlan: {
        candidate_source_zones: [{ zoneId: 'AI-Z06', availableSupply: 3 }],
        moves: [{ from_zone: 6, to_zone: 2, estimated_cost: 150000 }],
      },
      moves: [{ from_zone: 6, to_zone: 2, drivers: 3 }],
      relocationBonus: 50000,
      targetDriverCount: 3,
    })).toEqual({});
  });

  it('does not exceed the model allocation when candidate capacity is absent', () => {
    const errors = revisionFieldErrors({
      budgetLimit: 500000,
      currentSourcePlan: { moves: [{ from_zone: 6, to_zone: 2, units_to_move: 4 }] },
      moves: [{ from_zone: 6, to_zone: 2, drivers: 5 }],
      relocationBonus: 20000,
      targetDriverCount: 3,
    });

    expect(errors['sourcePlan.moves.0.drivers']).toContain('không được vượt quá 4');
  });

  it('rejects invented and duplicate routes that were not produced by the model', () => {
    const invented = revisionFieldErrors({
      budgetLimit: 500000,
      currentSourcePlan: { moves: [{ id: 'move-1', from_zone: 6, to_zone: 2, units_to_move: 4 }] },
      moves: [{ from_zone: 6, to_zone: 9, drivers: 2 }],
      relocationBonus: 20000,
      targetDriverCount: 3,
    });
    const duplicate = revisionFieldErrors({
      budgetLimit: 500000,
      currentSourcePlan: { moves: [{ id: 'move-1', from_zone: 6, to_zone: 2, units_to_move: 4 }] },
      moves: [
        { from_zone: 6, to_zone: 2, drivers: 1 },
        { from_zone: 6, to_zone: 2, drivers: 1 },
      ],
      relocationBonus: 20000,
      targetDriverCount: 3,
    });

    expect(invented['sourcePlan.moves.0.to_zone']).toContain('model');
    expect(duplicate['sourcePlan.moves.1.to_zone']).toContain('trùng');
  });
});
