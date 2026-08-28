import { describe, expect, it } from 'vitest'

import { mergeLogRows, rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import type { RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

const at = (second: number) => `2026-08-28T17:02:${String(second).padStart(2, '0')}+07:00`

const runEvent = (seq: number, second: number): RunEvent => ({
  seq, at: at(second), kind: 'narration', actor: 'graph', text: `run ${seq}`, source: 'deterministic',
})

const sessionRow = (seq: number, second: number, origin: LogRow['origin'] = 'session'): LogRow => ({
  origin, seq, at: at(second), kind: 'narration', actor: 'observer', text: `${origin} ${seq}`, source: 'deterministic',
})

describe('mergeLogRows', () => {
  it('xen hai luồng theo thời gian để đọc ra một mạch người–máy', () => {
    const merged = mergeLogRows(
      [runEvent(1, 1), runEvent(2, 5)],
      [sessionRow(1, 3, 'operator'), sessionRow(1, 4)],
    )

    expect(merged.map((row) => row.text)).toEqual(['run 1', 'operator 1', 'session 1', 'run 2'])
  })

  it('trong cùng một nguồn thì `seq` thắng, kể cả khi `at` trùng nhau', () => {
    // Đồng hồ tường trùng ở mức giây là chuyện thường; `seq` mới là thứ tự chuẩn.
    const merged = mergeLogRows([runEvent(3, 9), runEvent(1, 9), runEvent(2, 9)], [])

    expect(merged.map((row) => row.seq)).toEqual([1, 2, 3])
  })

  it('gắn nguồn cho sự kiện của lượt chạy để khoá React không đụng nhau', () => {
    const merged = mergeLogRows([runEvent(1, 1)], [sessionRow(1, 2)])

    expect(merged.map(rowKey)).toEqual(['run-1', 'session-1'])
    expect(new Set(merged.map(rowKey)).size).toBe(2)
  })

  it('hai nguồn cùng đánh số từ 1 vẫn không mất dòng nào', () => {
    const merged = mergeLogRows([runEvent(1, 1), runEvent(2, 2)], [sessionRow(1, 3), sessionRow(2, 4)])

    expect(merged).toHaveLength(4)
    expect(new Set(merged.map(rowKey)).size).toBe(4)
  })

  it('không nguồn nào rỗng thì vỡ', () => {
    expect(mergeLogRows([], [])).toEqual([])
    expect(mergeLogRows([runEvent(1, 1)], [])).toHaveLength(1)
    expect(mergeLogRows([], [sessionRow(1, 1)])).toHaveLength(1)
  })
})
