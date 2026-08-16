type Row = Record<string, unknown>;

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const campaignRows = (rows: Row[], campaignId: string) => rows.filter((row) => row.campaign_id === campaignId);
const rewardAmount = (rows: Row[], statuses: readonly string[]) => rows
  .filter((row) => statuses.includes(String(row.status)))
  .reduce((sum, row) => sum + numeric(row.amount), 0);

export function buildOperationsReport(campaigns: Row[], participations: Row[], trips: Row[], rewards: Row[], audits: Row[], generatedAt = new Date().toISOString(), ledger: Row[] = []) {
  const campaignReports = campaigns.map((campaign) => {
    const id = String(campaign.id);
    const campaignParticipations = campaignRows(participations, id);
    const campaignTrips = campaignRows(trips, id);
    const campaignRewards = campaignRows(rewards, id);
    const campaignLedger = campaignRows(ledger, id);
    const ledgerAmount = (type: string) => campaignLedger.filter((row) => row.entry_type === type).reduce((sum, row) => sum + numeric(row.amount), 0);
    const reservedVnd = ledgerAmount('RESERVED');
    const committedVnd = ledgerAmount('COMMITTED');
    const qualifiedVnd = ledgerAmount('QUALIFIED');
    const paidVnd = ledgerAmount('PAID');
    const compensationDueVnd = ledgerAmount('COMPENSATION_DUE');
    const releasedVnd = ledgerAmount('RELEASED');
    const budgetUsedVnd = campaignLedger.length ? committedVnd : numeric(campaign.budget_used);
    const rewardQualifiedVnd = rewardAmount(campaignRewards, ['QUALIFIED', 'SIMULATED_PAID']);
    return {
      id,
      status: String(campaign.status),
      startedAt: String(campaign.start_at ?? campaign.created_at),
      completedAt: campaign.completed_at ? String(campaign.completed_at) : null,
      activatedDrivers: campaignParticipations.filter((row) => row.status === 'ACTIVATED').length,
      qualifiedTrips: campaignTrips.filter((row) => row.status === 'COMPLETED').length,
      rewardQualifiedVnd,
      rewardPaidVnd: rewardAmount(campaignRewards, ['SIMULATED_PAID']),
      budgetUsedVnd,
      budgetLimitVnd: numeric(campaign.budget_limit),
      reservedVnd,
      committedVnd,
      qualifiedVnd,
      paidVnd,
      compensationDueVnd,
      releasedVnd,
      rewardBudgetDeltaVnd: budgetUsedVnd - rewardQualifiedVnd,
      netCostVnd: null,
      auditEvents: audits.filter((row) => row.entity_id === id).length,
    };
  });
  const sum = (field: 'activatedDrivers' | 'qualifiedTrips' | 'rewardQualifiedVnd' | 'rewardPaidVnd' | 'budgetUsedVnd' | 'rewardBudgetDeltaVnd' | 'auditEvents' | 'reservedVnd' | 'committedVnd' | 'qualifiedVnd' | 'paidVnd' | 'compensationDueVnd' | 'releasedVnd') => campaignReports.reduce((total, campaign) => total + campaign[field], 0);
  return {
    generatedAt,
    dataMode: 'DB_LEDGER',
    summary: {
      campaigns: campaignReports.length,
      activatedDrivers: sum('activatedDrivers'),
      qualifiedTrips: sum('qualifiedTrips'),
      rewardQualifiedVnd: sum('rewardQualifiedVnd'),
      rewardPaidVnd: sum('rewardPaidVnd'),
      budgetUsedVnd: sum('budgetUsedVnd'),
      reservedVnd: sum('reservedVnd'),
      committedVnd: sum('committedVnd'),
      qualifiedVnd: sum('qualifiedVnd'),
      paidVnd: sum('paidVnd'),
      compensationDueVnd: sum('compensationDueVnd'),
      releasedVnd: sum('releasedVnd'),
      rewardBudgetDeltaVnd: sum('rewardBudgetDeltaVnd'),
      auditEvents: sum('auditEvents'),
      netCostVnd: null,
    },
    campaigns: campaignReports,
    sources: {
      activatedDrivers: 'campaign_participations.status=ACTIVATED',
      qualifiedTrips: 'trips.status=COMPLETED',
      rewardQualifiedVnd: 'reward_records.status in (QUALIFIED, SIMULATED_PAID)',
      rewardPaidVnd: 'reward_records.status=SIMULATED_PAID',
      budgetUsedVnd: 'budget_ledger_entries.entry_type=COMMITTED (legacy fallback campaigns.budget_used)',
      budgetLifecycle: 'budget_ledger_entries grouped by RESERVED/COMMITTED/QUALIFIED/PAID/COMPENSATION_DUE/RELEASED',
      auditEvents: 'audit_logs.entity_id=campaign.id',
      netCostVnd: null,
    },
  };
}
