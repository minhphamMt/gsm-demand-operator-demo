import { describe, expect, it } from 'vitest'

import { auditApiFilters, auditFiltersFromUrl, auditFiltersToUrl } from '@/features/operator-history/model/auditFilters'

describe('audit URL filters', () => {
  it('normalizes pagination and converts date boundaries for the API', () => {
    const url = new URLSearchParams('action=Approved&actorType=OPERATOR&from=2026-08-01&to=2026-08-09&page=2&pageSize=50')
    const filters = auditFiltersFromUrl(url)

    expect(auditApiFilters(filters)).toMatchObject({
      action: 'Approved', actorType: 'OPERATOR', page: 2, pageSize: 50,
      from: '2026-08-01T00:00:00.000Z', to: '2026-08-09T23:59:59.999Z',
    })
    expect(auditFiltersToUrl(filters).toString()).toContain('page=2')
  })

  it('falls back safely for malformed page and action values', () => {
    const filters = auditFiltersFromUrl(new URLSearchParams('page=-1&pageSize=500&action=Tampered'))
    expect(filters).toMatchObject({ action: '', page: 1, pageSize: 100 })
  })
})
