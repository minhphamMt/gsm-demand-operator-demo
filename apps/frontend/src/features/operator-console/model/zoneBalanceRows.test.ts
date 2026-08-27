import { describe, expect, it } from 'vitest'

import type { Zone } from '@/features/operator-data'
import { zoneBalanceRows } from './zoneBalanceRows'

const zone = (id: string, fields: Partial<Zone>): Zone => ({
  id, label: id, dataStatus: 'live', demand: 10, supply: 10, gap: 0, ...fields,
} as Zone)

describe('zoneBalanceRows', () => {
  it('puts the widest shortage first and the largest surplus last', () => {
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

  // Hồi quy: cắt top-N sau khi sắp xếp giảm dần sẽ xoá sạch nhóm zone dư khi số zone thiếu
  // vượt hạn mức — điều chuyển khi đó không còn thấy chỗ nào để rút xe.
  it('keeps surplus zones visible even when shortages outnumber the display budget', () => {
    const many = [
      ...Array.from({ length: 20 }, (_, index) => zone(`D${index}`, { operationalGap: index + 1 })),
      zone('S1', { operationalGap: -9 }),
      zone('S2', { operationalGap: -4 }),
    ]

    const rows = zoneBalanceRows(many, { deficits: 6, surpluses: 3 })

    expect(rows.filter((row) => row.gap > 0)).toHaveLength(6)
    expect(rows.filter((row) => row.gap < 0).map((row) => row.id)).toEqual(['S2', 'S1'])
  })

  it('caps each side independently so the column stays readable', () => {
    const many = [
      ...Array.from({ length: 12 }, (_, index) => zone(`D${index}`, { operationalGap: index + 1 })),
      ...Array.from({ length: 12 }, (_, index) => zone(`S${index}`, { operationalGap: -(index + 1) })),
    ]

    expect(zoneBalanceRows(many, { deficits: 4, surpluses: 2 })).toHaveLength(6)
  })
})
