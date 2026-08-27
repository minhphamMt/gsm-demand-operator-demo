import { describe, expect, it } from 'vitest'

import type { ReplayTimelineStep } from '@/features/operator-data'
import { demandTrendRows } from '../model/demandTrendRows'

const step = (sourceAt: string, fields: Partial<ReplayTimelineStep> = {}): ReplayTimelineStep =>
  ({ meanRainMmH: 0, sourceAt, ...fields })

describe('demandTrendRows', () => {
  it('keeps the observed order and rounds the totals', () => {
    const rows = demandTrendRows([
      step('2026-08-28T08:00:00+07:00', { totalDemand: 310.4, totalSupply: 402.6 }),
      step('2026-08-28T08:05:00+07:00', { totalDemand: 322.5, totalSupply: 398.2 }),
    ])

    expect(rows.map((row) => [row.demand, row.supply])).toEqual([[310, 403], [323, 398]])
  })

  // Mốc cũ của contract chỉ mang lượng mưa. Vẽ chúng ở 0 sẽ tạo một hố giữa đường cong,
  // đọc thành "mạng lưới sập" thay vì "mốc này chưa có số".
  it('drops steps without totals instead of charting them as zero', () => {
    const rows = demandTrendRows([
      step('2026-08-28T08:00:00+07:00', { totalDemand: 310, totalSupply: 400 }),
      step('2026-08-28T08:05:00+07:00'),
      step('2026-08-28T08:10:00+07:00', { totalDemand: 290, totalSupply: 380 }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.demand)).toEqual([310, 290])
  })

  it('labels each point by clock time so the day rhythm is readable', () => {
    const rows = demandTrendRows([step('2026-08-28T08:05:00+07:00', { totalDemand: 1, totalSupply: 1 })])

    expect(rows[0]?.label).toMatch(/^\d{2}:\d{2}$/)
  })
})
