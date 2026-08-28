// Tích lũy sự kiện qua nhiều lượt poll — MA-6.7.
//
// Ba tình huống được kiểm ở đây đều là thứ chỉ lộ ra sau vài phút chạy thật, và cả ba đều
// làm nhật ký sai một cách im lặng: dòng nhân đôi, dòng biến mất khi mạng chớp, và nhật ký
// cụt không nói gì khi run bị máy chủ thu hồi.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { AppError } from '@/shared/api/client'

const getPipelineRun = vi.fn()
const startPipelineRun = vi.fn()

vi.mock('@/features/operator-data', () => ({
  useOperatorActions: () => ({
    getPipelineRun: { mutateAsync: getPipelineRun },
    startPipelineRun: { mutate: startPipelineRun, isPending: false },
  }),
}))

const { usePipelineRun } = await import('@/features/operator-pipeline/hooks/usePipelineRun')

const line = (seq: number, text: string) => ({
  seq,
  at: `2026-08-28T17:02:${String(seq).padStart(2, '0')}+07:00`,
  kind: 'narration',
  actor: 'graph',
  text,
  source: 'deterministic',
})

const running = (events: unknown[]): PipelineRunRecord =>
  ({ run_id: 'RUN-1', status: 'RUNNING', events }) as PipelineRunRecord

// Fake timer làm `waitFor` treo (nó chờ trên đồng hồ thật), nên test ở đây **không** dùng
// waitFor: mọi lượt gọi đều là promise đã resolve sẵn, chỉ cần xả hết microtask là state chốt.
// Nhờ vậy khẳng định chạy đồng bộ ngay sau mỗi nhịp — không có timeout nào để mà chớp đỏ.
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Khởi động một run rồi trả về handle của hook, đã có sẵn lượt tải đầu tiên. */
async function startedRun(first: PipelineRunRecord) {
  getPipelineRun.mockResolvedValueOnce(first)
  startPipelineRun.mockImplementation((_input: unknown, options: { onSuccess: (r: { runId: string }) => void }) => {
    options.onSuccess({ runId: 'RUN-1' })
  })

  const handle = renderHook(() => usePipelineRun())
  await act(async () => {
    handle.result.current.start({ horizonMinutes: 15 })
  })
  await flush()
  return handle
}

/** Một nhịp poll: đẩy đồng hồ qua 2 giây rồi để promise của lượt gọi giải quyết. */
async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(2_000)
  })
  await flush()
}

describe('usePipelineRun', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getPipelineRun.mockReset()
    startPipelineRun.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('gộp sự kiện theo seq nên một dòng gửi lại nhiều lượt không bị nhân đôi', async () => {
    const handle = await startedRun(running([line(1, 'một'), line(2, 'hai')]))
    expect(handle.result.current.events).toHaveLength(2)

    // Server gửi lại **cả mảng** mỗi lượt poll, không phải phần tăng thêm.
    getPipelineRun.mockResolvedValueOnce(running([line(1, 'một'), line(2, 'hai'), line(3, 'ba')]))
    await tick()

    expect(handle.result.current.events).toHaveLength(3)
    expect(handle.result.current.events.map((event) => event.seq)).toEqual([1, 2, 3])
  })

  it('sắp theo seq chứ không theo thứ tự response về', async () => {
    const handle = await startedRun(running([line(3, 'ba')]))
    getPipelineRun.mockResolvedValueOnce(running([line(1, 'một'), line(2, 'hai'), line(3, 'ba')]))
    await tick()

    expect(handle.result.current.events).toHaveLength(3)
    expect(handle.result.current.events.map((event) => event.text)).toEqual(['một', 'hai', 'ba'])
  })

  it('bỏ dòng hỏng nhưng giữ nguyên những dòng còn lại', async () => {
    const handle = await startedRun(running([line(1, 'một'), { seq: 2 }, null, line(3, 'ba')]))

    expect(handle.result.current.events.map((event) => event.seq)).toEqual([1, 3])
  })

  it('lỗi mạng thoáng qua không làm mất dòng nào và không dừng poll', async () => {
    const handle = await startedRun(running([line(1, 'một')]))

    getPipelineRun.mockRejectedValueOnce(new Error('mạng chớp'))
    await tick()
    expect(handle.result.current.events).toHaveLength(1)

    getPipelineRun.mockResolvedValueOnce(running([line(1, 'một'), line(2, 'hai')]))
    await tick()
    expect(handle.result.current.events).toHaveLength(2)
  })

  it('run bị thu hồi thì dừng poll, giữ phần đã tải và nói rõ là đã dừng', async () => {
    const handle = await startedRun(running([line(1, 'một'), line(2, 'hai')]))

    getPipelineRun.mockRejectedValueOnce(new AppError('Không có run', { status: 404 }))
    await tick()

    expect(handle.result.current.events).toHaveLength(3)
    const events = handle.result.current.events
    // Phần đã tải ở lại nguyên vẹn — đây là điểm khác giữa "thu hồi" và "xóa sạch".
    expect(events.slice(0, 2).map((event) => event.text)).toEqual(['một', 'hai'])
    expect(events[2]?.code).toBe('RUN_EVICTED')
    expect(events[2]?.seq).toBe(3)

    // Đã dừng: các nhịp sau không gọi thêm lượt nào nữa.
    const callsAfterEviction = getPipelineRun.mock.calls.length
    await tick()
    await tick()
    expect(getPipelineRun.mock.calls.length).toBe(callsAfterEviction)
  })

  it('chạy lượt mới thì xóa nhật ký cũ, không nối vào đuôi lượt trước', async () => {
    const handle = await startedRun(running([line(1, 'một'), line(2, 'hai')]))

    getPipelineRun.mockResolvedValueOnce(running([line(1, 'lượt mới')]))
    await act(async () => {
      handle.result.current.start({ horizonMinutes: 5 })
    })

    expect(handle.result.current.events).toHaveLength(1)
    expect(handle.result.current.events[0]?.text).toBe('lượt mới')
  })

  it('dừng poll khi run đã DONE', async () => {
    const handle = await startedRun({ run_id: 'RUN-1', status: 'DONE', events: [line(1, 'xong')] } as PipelineRunRecord)
    const callsWhenDone = getPipelineRun.mock.calls.length

    await tick()
    await tick()

    expect(getPipelineRun.mock.calls.length).toBe(callsWhenDone)
    expect(handle.result.current.events).toHaveLength(1)
  })
})
