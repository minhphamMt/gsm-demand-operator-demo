import { describe, expect, it } from 'vitest'

import { hasInvalidReportRange, reportFilterState, toOperationsReportFilters } from '@/features/operator-reports/model/reportFilters'

describe('operations report filters', () => {
  it('keeps shareable campaign/date filters and converts the Hanoi day to API timestamps', () => {
    const state = reportFilterState(new URLSearchParams('campaignId=campaign-1&from=2026-08-09&to=2026-08-10'))
    expect(toOperationsReportFilters(state)).toEqual({ campaignId: 'campaign-1', from: '2026-08-08T17:00:00.000Z', to: '2026-08-10T16:59:59.999Z' })
    expect(hasInvalidReportRange(state)).toBe(false)
  })

  it('rejects a reversed date range before calling the server', () => {
    expect(hasInvalidReportRange({ campaignId: 'all', fromDate: '2026-08-10', toDate: '2026-08-09' })).toBe(true)
  })
})
