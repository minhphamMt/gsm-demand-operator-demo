import { describe, expect, it } from 'vitest'

import { liveAwaitingSeq, mergeLogRows, rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import { GATE_CAMPAIGN_CODE, GATE_PLAN_CODE, GATE_PLAN_REJECTED_CODE } from '@/features/operator-console/model/operatorLog'
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

describe('liveAwaitingSeq', () => {
  const cho = (seq: number): LogRow => ({
    origin: 'run', seq, at: at(seq), kind: 'awaiting_approval',
    actor: 'graph', text: '⏸ chờ người vận hành duyệt PLAN_B', source: 'system', code: 'AWAITING_APPROVAL',
  })
  const thaoTac = (seq: number, code: string): LogRow => ({
    origin: 'action', seq, at: at(seq), kind: 'operator_action',
    actor: 'operator', text: 'đã làm gì đó', source: 'system', ok: true, code,
  })

  it('không có dòng chờ thì không có gì đang treo', () => {
    expect(liveAwaitingSeq([])).toBeNull()
    expect(liveAwaitingSeq([runEvent(1, 1)].map((event) => ({ ...event, origin: 'run' as const })))).toBeNull()
  })

  it('có dòng chờ mà chưa ai quyết thì nó còn treo', () => {
    expect(liveAwaitingSeq([cho(5)])).toBe(5)
  })

  it.each([
    ['phê duyệt', GATE_PLAN_CODE],
    ['từ chối', GATE_PLAN_REJECTED_CODE],
  ])('%s xong thì thôi treo', (_ten, code) => {
    expect(liveAwaitingSeq([cho(5), thaoTac(6, code)])).toBeNull()
  })

  it('lưu bản chỉnh sửa KHÔNG đóng vòng chờ — v2 vẫn phải được duyệt', () => {
    const revise = { ...thaoTac(6, ''), code: null }

    expect(liveAwaitingSeq([cho(5), revise])).toBe(5)
  })

  it('phát hành campaign không đóng vòng chờ phương án — đó là cổng khác', () => {
    expect(liveAwaitingSeq([cho(5), thaoTac(6, GATE_CAMPAIGN_CODE)])).toBe(5)
  })

  it('quyết định của lượt TRƯỚC không tắt dòng chờ của lượt SAU', () => {
    // Duyệt xong, chạy lại, lại chờ. Chỉ đọc từ dòng chờ gần nhất trở đi mới đúng.
    const rows = [cho(1), thaoTac(2, GATE_PLAN_CODE), cho(3)]

    expect(liveAwaitingSeq(rows)).toBe(3)
  })
})
