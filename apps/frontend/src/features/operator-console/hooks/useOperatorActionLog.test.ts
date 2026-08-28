import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useOperatorActionLog } from '@/features/operator-console/hooks/useOperatorActionLog'
import { GATE_PLAN_CODE } from '@/features/operator-console/model/operatorLog'

describe('useOperatorActionLog', () => {
  it('ghi một dòng khi thao tác đã xong', () => {
    const { result } = renderHook(() => useOperatorActionLog())

    act(() => { result.current.noteDone('approve', 'PLAN_B (v1)') })

    const [row] = result.current.rows
    expect(row?.origin).toBe('action')
    expect(row?.actor).toBe('operator')
    expect(row?.text).toBe('đã phê duyệt phương án PLAN_B (v1)')
    expect(row?.ok).toBe(true)
    expect(row?.code).toBe(GATE_PLAN_CODE)
    expect(row?.at.endsWith('Z') || row?.at.includes('+')).toBe(true)
  })

  it('thao tác hỏng thành một dòng cảnh báo kèm lý do', () => {
    const { result } = renderHook(() => useOperatorActionLog())

    act(() => { result.current.noteFailed('release_dispatch', new Error('Phương án đã bị hủy')) })

    const [row] = result.current.rows
    expect(row?.kind).toBe('warning')
    expect(row?.ok).toBe(false)
    expect(row?.text).toContain('Phương án đã bị hủy')
    // Dòng hỏng không mang mã cổng — nó không phải một quyết định đã xảy ra.
    expect(row?.code).toBeNull()
  })

  it('đánh số liên tiếp để trộn với các nguồn khác mà không đụng khoá', () => {
    const { result } = renderHook(() => useOperatorActionLog())

    act(() => {
      result.current.noteDone('forecast')
      result.current.noteDone('optimize')
      result.current.noteFailed('approve', new Error('hỏng'))
    })

    expect(result.current.rows.map((row) => row.seq)).toEqual([1, 2, 3])
    expect(new Set(result.current.rows.map((row) => row.origin))).toEqual(new Set(['action']))
  })

  it('không ghi gì cho tới khi có kết quả — bấm là ý định, không phải sự việc', () => {
    const { result } = renderHook(() => useOperatorActionLog())

    expect(result.current.rows).toEqual([])
  })
})
