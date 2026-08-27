import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { zoneBalanceRows } from './zoneBalanceRows'

const zone = (id: string, fields: Partial<Zone>): Zone => ({
  id, label: id, dataStatus: 'live', demand: 10, supply: 10, gap: 0, ...fields,
} as Zone)

describe('zoneBalanceRows', () => {
  it('ranks the widest shortage first and keeps surplus zones at the far end', () => {
    const rows = zoneBalanceRows([
      zone('AI-Z01', { operationalGap: -6 }),
      zone('AI-Z02', { operationalGap: 12 }),
      zone('AI-Z03', { operationalGap: 4 }),
    ])

    expect(rows.map((row) => row.id)).toEqual(['AI-Z02', 'AI-Z03', 'AI-Z01'])
    expect(rows.map((row) => row.gap)).toEqual([12, 4, -6])
  })

  it('drops balanced zones so the chart only carries zones needing a decision', () => {
    const rows = zoneBalanceRows([zone('AI-Z01', { operationalGap: 0 }), zone('AI-Z02', { operationalGap: 5 })])

    expect(rows.map((row) => row.id)).toEqual(['AI-Z02'])
  })

  // Zone thiếu dữ liệu không được vẽ ở mốc 0 — đó là "chưa đo được", không phải "đang cân bằng".
  it('excludes zones without a valid observation instead of charting them as balanced', () => {
    const rows = zoneBalanceRows([
      zone('AI-Z01', { dataStatus: 'missing', demand: null, supply: null, gap: null, operationalGap: 9 }),
      zone('AI-Z02', { operationalGap: 3 }),
    ])

    expect(rows.map((row) => row.id)).toEqual(['AI-Z02'])
  })

  it('caps the row count so the chart stays readable on a narrow column', () => {
    const many = Array.from({ length: 30 }, (_, index) => zone(`AI-Z${index + 1}`, { operationalGap: index + 1 }))

    expect(zoneBalanceRows(many)).toHaveLength(12)
    expect(zoneBalanceRows(many, 4)).toHaveLength(4)
  })
})
