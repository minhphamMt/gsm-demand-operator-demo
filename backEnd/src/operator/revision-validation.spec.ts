import { revisionFieldErrors } from './revision-validation';

describe('revisionFieldErrors', () => {
  it('returns source-supply and budget errors by AI zone field', () => {
    const errors = revisionFieldErrors({
      budgetLimit: 100000,
      currentSourcePlan: { candidate_source_zones: [{ zone_id: 6, available_supply: 3 }] },
      moves: [{ from_zone: 6, drivers: 2 }, { from_zone: 6, drivers: 2 }],
      relocationBonus: 50000,
      targetDriverCount: 3,
    });

    expect(errors).toEqual({
      'sourcePlan.moves.0.drivers': 'Tổng số xe lấy từ zone nguồn không được vượt quá 3.',
      'sourcePlan.moves.1.drivers': 'Tổng số xe lấy từ zone nguồn không được vượt quá 3.',
      budgetLimit: 'Hạn mức phải ít nhất bằng cam kết tối đa 150000 VND.',
    });
  });

  it('accepts a revision within source and budget limits', () => {
    expect(revisionFieldErrors({
      budgetLimit: 150000,
      currentSourcePlan: { candidate_source_zones: [{ zoneId: 'AI-Z06', availableSupply: 3 }] },
      moves: [{ from_zone: 6, drivers: 3 }],
      relocationBonus: 50000,
      targetDriverCount: 3,
    })).toEqual({});
  });
});
