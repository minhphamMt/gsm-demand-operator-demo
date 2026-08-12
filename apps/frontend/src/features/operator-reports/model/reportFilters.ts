import type { OperationsReportFilters } from '@/features/operator-data'

export type ReportFilterState = { campaignId: string; fromDate: string; toDate: string }

export function reportFilterState(search: URLSearchParams): ReportFilterState {
  return { campaignId: search.get('campaignId') ?? 'all', fromDate: search.get('from') ?? '', toDate: search.get('to') ?? '' }
}

export function hasInvalidReportRange(filters: ReportFilterState) {
  return Boolean(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate)
}

export function toOperationsReportFilters(filters: ReportFilterState): OperationsReportFilters {
  return {
    ...(filters.campaignId !== 'all' ? { campaignId: filters.campaignId } : {}),
    ...(filters.fromDate ? { from: new Date(`${filters.fromDate}T00:00:00+07:00`).toISOString() } : {}),
    ...(filters.toDate ? { to: new Date(`${filters.toDate}T23:59:59.999+07:00`).toISOString() } : {}),
  }
}
