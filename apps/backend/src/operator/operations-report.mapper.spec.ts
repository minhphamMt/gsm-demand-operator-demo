import { buildOperationsReport } from './operations-report.mapper';

describe('buildOperationsReport', () => {
  it('reconciles campaign totals from trips, rewards, participations and audit without inventing net cost', () => {
    const report = buildOperationsReport(
      [{ id: 'c1', status: 'COMPLETED', start_at: '2026-08-09T10:00:00Z', budget_used: 120, budget_limit: 200 }],
      [{ campaign_id: 'c1', status: 'ACTIVATED' }],
      [{ campaign_id: 'c1', status: 'COMPLETED' }, { campaign_id: 'c1', status: 'CANCELLED' }],
      [{ campaign_id: 'c1', status: 'QUALIFIED', amount: 50 }, { campaign_id: 'c1', status: 'SIMULATED_PAID', amount: 70 }],
      [{ entity_id: 'c1' }, { entity_id: 'other' }],
      '2026-08-09T12:00:00Z',
      [
        { campaign_id: 'c1', entry_type: 'RESERVED', amount: 200 },
        { campaign_id: 'c1', entry_type: 'COMMITTED', amount: 120 },
        { campaign_id: 'c1', entry_type: 'QUALIFIED', amount: 100 },
        { campaign_id: 'c1', entry_type: 'PAID', amount: 70 },
        { campaign_id: 'c1', entry_type: 'COMPENSATION_DUE', amount: 20 },
        { campaign_id: 'c1', entry_type: 'RELEASED', amount: 80 },
      ],
    );

    expect(report.summary).toEqual({ campaigns: 1, activatedDrivers: 1, qualifiedTrips: 1, rewardQualifiedVnd: 120, rewardPaidVnd: 70, budgetUsedVnd: 120, reservedVnd: 200, committedVnd: 120, qualifiedVnd: 100, paidVnd: 70, compensationDueVnd: 20, releasedVnd: 80, rewardBudgetDeltaVnd: 0, auditEvents: 1, netCostVnd: null });
    expect(report.campaigns[0]).toMatchObject({ reservedVnd: 200, compensationDueVnd: 20, rewardBudgetDeltaVnd: 0, netCostVnd: null });
    expect(report.sources.netCostVnd).toBeNull();
  });
});
