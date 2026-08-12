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
    );

    expect(report.summary).toEqual({ campaigns: 1, activatedDrivers: 1, qualifiedTrips: 1, rewardQualifiedVnd: 120, rewardPaidVnd: 70, budgetUsedVnd: 120, rewardBudgetDeltaVnd: 0, auditEvents: 1, netCostVnd: null });
    expect(report.campaigns[0]).toMatchObject({ rewardBudgetDeltaVnd: 0, netCostVnd: null });
    expect(report.sources.netCostVnd).toBeNull();
  });
});
