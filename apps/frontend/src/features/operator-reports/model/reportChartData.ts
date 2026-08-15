import type { OperationsCampaignReport, OperationsReport } from '@/features/operator-data'

export type CampaignActivityRow = {
  id: string
  label: string
  activatedDrivers: number
  qualifiedTrips: number
  budgetUtilization: number
}

export function campaignActivityRows(campaigns: readonly OperationsCampaignReport[], limit = 8): CampaignActivityRow[] {
  return campaigns
    .filter((campaign) => campaign.activatedDrivers > 0 || campaign.qualifiedTrips > 0 || campaign.budgetUsedVnd > 0)
    .map((campaign) => ({
      id: campaign.id,
      label: campaign.id.length > 12 ? `#${campaign.id.slice(-6)}` : campaign.id,
      activatedDrivers: campaign.activatedDrivers,
      qualifiedTrips: campaign.qualifiedTrips,
      budgetUtilization: campaign.budgetLimitVnd > 0
        ? Math.min(100, Math.round((campaign.budgetUsedVnd / campaign.budgetLimitVnd) * 100))
        : 0,
    }))
    .sort((left, right) => right.activatedDrivers - left.activatedDrivers || right.qualifiedTrips - left.qualifiedTrips)
    .slice(0, limit)
}

export function budgetLifecycleRows(summary: OperationsReport['summary']) {
  return [
    { label: 'Giữ chỗ', amount: summary.reservedVnd },
    { label: 'Cam kết', amount: summary.committedVnd },
    { label: 'Đủ điều kiện', amount: summary.qualifiedVnd },
    { label: 'Đã trả', amount: summary.paidVnd },
    { label: 'Chờ bồi thường', amount: summary.compensationDueVnd },
    { label: 'Đã hoàn', amount: summary.releasedVnd },
  ]
}

export function campaignStatusRows(campaigns: readonly OperationsCampaignReport[]) {
  const counts = new Map<string, number>()
  campaigns.forEach((campaign) => counts.set(campaign.status, (counts.get(campaign.status) ?? 0) + 1))
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status))
}
