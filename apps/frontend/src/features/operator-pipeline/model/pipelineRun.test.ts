import { afterEach, describe, expect, it, vi } from 'vitest'

import { eventClock, operatorNowIso } from '@/features/operator-pipeline/model/pipelineRun'

describe('operatorNowIso', () => {
  afterEach(() => vi.useRealTimers())

  it('dựng mốc theo giờ vận hành, không phải UTC', () => {
    // `new Date().toISOString()` trả UTC, mà `eventClock` cắt thẳng ký tự 11–19 — nên một dòng
    // do client dựng sẽ hiện lệch đúng 7 tiếng so với dòng của server, ngay cạnh nhau.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T04:16:02.000Z'))

    expect(operatorNowIso()).toBe('2026-08-29T11:16:02+07:00')
    expect(eventClock(operatorNowIso())).toBe('11:16:02')
  })

  it('cùng khuôn với mốc của server nên hai nguồn đọc ra một đồng hồ', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T04:16:02.000Z'))
    const cuaServer = '2026-08-29T11:16:03+07:00'

    expect(eventClock(operatorNowIso())).toBe('11:16:02')
    expect(eventClock(cuaServer)).toBe('11:16:03')
  })

  it('qua nửa đêm vẫn đúng ngày', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T18:30:00.000Z'))

    expect(operatorNowIso()).toBe('2026-08-30T01:30:00+07:00')
  })
})

describe('eventClock', () => {
  it('quy mốc UTC của Postgres về giờ vận hành', () => {
    // Bản ghi audit đến từ DB mang `+00:00`. Cắt thẳng chuỗi sẽ hiện lệch đúng 7 tiếng ngay
    // cạnh những dòng khác trong cùng một nhật ký.
    expect(eventClock('2026-08-29T04:16:02+00:00')).toBe('11:16:02')
  })

  it('mốc đã ở giờ vận hành thì giữ nguyên', () => {
    expect(eventClock('2026-08-29T11:16:02+07:00')).toBe('11:16:02')
  })

  it('cùng một khoảnh khắc viết bằng hai offset đọc ra cùng một giờ', () => {
    expect(eventClock('2026-08-29T04:16:02Z')).toBe(eventClock('2026-08-29T11:16:02+07:00'))
  })

  it('mốc hỏng thì nói là hỏng, không đoán', () => {
    expect(eventClock('không phải mốc')).toBe('--:--:--')
    expect(eventClock('')).toBe('--:--:--')
  })
})
