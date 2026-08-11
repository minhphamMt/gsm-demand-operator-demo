type Row = Record<string, unknown>;

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const campaignRows = (rows: Row[], campaignId: string) => rows.filter((row) => row.campaign_id === campaignId);
const rewardAmount = (rows: Row[], statuses: readonly string[]) => rows
  .filter((row) => statuses.includes(String(row.status)))
  .reduce((sum, row) => sum + numeric(row.amount), 0);

export function buildOperationsReport(campaigns: Row[], participations: Row[], trips: Row[], rewards: Row[], audits: Row[], generatedAt = new Date().toISOString()) {
  const campaignReports = campaigns.map((campaign) => {
    const id = String(campaign.id);
    const campaignParticipations = campaignRows(participations, id);
    const campaignTrips = campaignRows(trips, id);
    const campaignRewards = campaignRows(rewards, id);
    const budgetUsedVnd = numeric(campaign.budget_used);
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
      rewardBudgetDeltaVnd: budgetUsedVnd - rewardQualifiedVnd,
      netCostVnd: null,
      auditEvents: audits.filter((row) => row.entity_id === id).length,
    };
  });
  const sum = (field: 'activatedDrivers' | 'qualifiedTrips' | 'rewardQualifiedVnd' | 'rewardPaidVnd' | 'budgetUsedVnd' | 'rewardBudgetDeltaVnd' | 'auditEvents') => campaignReports.reduce((total, campaign) => total + campaign[field], 0);
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
      budgetUsedVnd: 'campaigns.budget_used',
      auditEvents: 'audit_logs.entity_id=campaign.id',
      netCostVnd: null,
    },
  };
}
