import { describe, expect, it } from 'vitest'

import type { OperationsCampaignReport, OperationsReport } from '@/features/operator-data'
import { budgetLifecycleRows, campaignActivityRows, campaignStatusRows } from '@/features/operator-reports/model/reportChartData'

const campaign = (id: string, activatedDrivers: number, qualifiedTrips: number, status = 'Completed'): OperationsCampaignReport => ({
  id,
  status,
  startedAt: '2026-08-15T08:00:00Z',
  completedAt: '2026-08-15T09:00:00Z',
  activatedDrivers,
  qualifiedTrips,
  rewardQualifiedVnd: 0,
  rewardPaidVnd: 0,
  budgetUsedVnd: activatedDrivers * 10,
  budgetLimitVnd: 100,
  rewardBudgetDeltaVnd: 0,
  netCostVnd: null,
  auditEvents: 0,
  reservedVnd: 0,
  committedVnd: 0,
  qualifiedVnd: 0,
  paidVnd: 0,
  compensationDueVnd: 0,
  releasedVnd: 0,
})

describe('report chart data', () => {
  it('omits empty campaigns and prioritizes the most active ones', () => {
    const rows = campaignActivityRows([
      campaign('empty000', 0, 0),
      campaign('active01', 3, 2),
      campaign('active02', 7, 4),
    ])
    expect(rows.map((row) => row.id)).toEqual(['active02', 'active01'])
    expect(rows.map((row) => row.label)).toEqual(['active02', 'active01'])
    expect(rows[0]?.budgetUtilization).toBe(70)
  })

  it('groups campaign statuses for the distribution chart', () => {
    expect(campaignStatusRows([
      campaign('1', 1, 1, 'Completed'),
      campaign('2', 1, 1, 'Completed'),
      campaign('3', 1, 1, 'Cancelled'),
    ])).toEqual([{ status: 'Completed', count: 2 }, { status: 'Cancelled', count: 1 }])
  })

  it('keeps readable short ids and disambiguates long database ids', () => {
    expect(campaignActivityRows([campaign('CMP-017', 1, 1)])[0]?.label).toBe('CMP-017')
    expect(campaignActivityRows([campaign('42100001-0000-4000-8000-000000000004', 1, 1)])[0]?.label).toBe('#000004')
  })

  it('keeps the ledger lifecycle order stable', () => {
    const summary = {
      reservedVnd: 1, committedVnd: 2, qualifiedVnd: 3, paidVnd: 4, compensationDueVnd: 5, releasedVnd: 6,
    } as OperationsReport['summary']
    expect(budgetLifecycleRows(summary).map((row) => row.amount)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
