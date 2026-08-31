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

  it('quy giờ dataset về giờ vận hành, đúng phép mà cả bảng điều hành dùng', () => {
    // Đây là lỗi mà test này sinh ra để chặn: dataset chạy lịch tháng 9, đồng hồ vận hành
    // chạy tháng 10. Dán thẳng giờ dataset thì trục hoành lệch cả tháng so với header, và
    // biểu đồ trông như số bịa dù từng con số đều thật.
    const rows = demandTrendRows(
      [step('2026-09-26T07:05:00+07:00', { totalDemand: 1, totalSupply: 1 })],
      { anchorSourceAt: '2026-09-26T08:05:00+07:00', serverNow: '2026-10-01T22:27:00+07:00' },
    )

    // Mốc lùi 1 tiếng so với mốc neo, nên phải rơi đúng 1 tiếng trước bucket sống (22:25).
    expect(rows[0]?.label).toBe('21:25')
  })

  it('thiếu mốc neo thì giữ nguyên giờ dataset, không đoán', () => {
    const rows = demandTrendRows([step('2026-09-26T07:05:00+07:00', { totalDemand: 1, totalSupply: 1 })])

    expect(rows[0]?.label).toBe('07:05')
  })

  it('ghim múi giờ Hà Nội, không đọc theo máy người xem', () => {
    // `Date.getHours()` cũ đọc theo múi giờ trình duyệt: cùng một mốc sẽ hiện giờ khác nhau
    // tuỳ máy ai mở. Mốc này là 07:05 giờ Hà Nội dù viết ở UTC.
    const rows = demandTrendRows([step('2026-09-26T00:05:00+00:00', { totalDemand: 1, totalSupply: 1 })])

    expect(rows[0]?.label).toBe('07:05')
  })
})
