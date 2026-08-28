// Phiên hỏi–đáp — Chặng 7.
//
// Test đắt nhất: `test` về allowlist directive. Nó khẳng định rằng dù server (hoặc thứ gì
// đứng giữa) có gửi về `action` gì đi nữa, client chỉ thi hành đúng một hành động vô hại.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const askAgent = vi.fn()
const getAgentSession = vi.fn()

vi.mock('@/features/operator-data', () => ({
  useOperatorActions: () => ({
    askAgent: { mutate: askAgent, isPending: false },
    getAgentSession: { mutateAsync: getAgentSession },
  }),
}))

const { useObserverSession } = await import('@/features/operator-pipeline/hooks/useObserverSession')

const askOptions = (onStartRun = vi.fn()) => ({ horizonMinutes: 15 as const, onStartRun })

const line = (seq: number, kind: string, text = `dòng ${seq}`) => ({
  seq, at: `2026-08-28T17:02:${String(seq).padStart(2, '0')}+07:00`,
  kind, actor: 'observer', text, source: 'deterministic',
})

/** Trả lời của server cho POST: chọn `action`, rồi phiên trả về `events`. */
function serverReplies(action: string | null, events: unknown[] = []) {
  askAgent.mockImplementation((_input: unknown, handlers: { onSuccess: (r: { action: string | null }) => void }) => {
    handlers.onSuccess({ action })
  })
  getAgentSession.mockResolvedValue(events)
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useObserverSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    askAgent.mockReset()
    getAgentSession.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hiện ngay câu vừa gõ, không đợi server echo lại', async () => {
    serverReplies(null)
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('zone nào thiếu xe', askOptions()) })

    const mine = result.current.rows.filter((row) => row.origin === 'operator')
    expect(mine.map((row) => row.text)).toEqual(['zone nào thiếu xe'])
    expect(mine[0]?.kind).toBe('operator_message')
  })

  it('bỏ qua câu rỗng', async () => {
    serverReplies(null)
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('   ', askOptions()) })

    expect(askAgent).not.toHaveBeenCalled()
    expect(result.current.rows).toHaveLength(0)
  })

  it('thi hành đúng directive start_run', async () => {
    const onStartRun = vi.fn()
    serverReplies('start_run')
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('chạy phân tích', askOptions(onStartRun)) })

    expect(onStartRun).toHaveBeenCalledTimes(1)
  })

  it.each(['approve_plan', 'issue_offers', 'execute_relocation', 'START_RUN', 'anything'])(
    'bỏ qua directive lạ %s — allowlist của client là khoá thứ hai',
    async (action) => {
      const onStartRun = vi.fn()
      serverReplies(action)
      const { result } = renderHook(() => useObserverSession())

      await act(async () => { result.current.ask('làm gì đó đi', askOptions(onStartRun)) })

      expect(onStartRun).not.toHaveBeenCalled()
    },
  )

  it('không directive thì không chạy gì cả', async () => {
    const onStartRun = vi.fn()
    serverReplies(null)
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('thời tiết thế nào', askOptions(onStartRun)) })

    expect(onStartRun).not.toHaveBeenCalled()
  })

  it('gộp câu trả lời của server vào cùng dòng chảy', async () => {
    serverReplies(null, [line(1, 'agent_started'), line(2, 'tool_finished', '23 zone mưa')])
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('thời tiết', askOptions()) })
    await flush()

    expect(result.current.rows.map((row) => row.text)).toContain('23 zone mưa')
    expect(result.current.rows.filter((row) => row.origin === 'session')).toHaveLength(2)
  })

  it('dừng poll khi server đóng câu trả lời bằng agent_finished', async () => {
    serverReplies(null, [line(1, 'agent_started'), line(2, 'tool_finished'), line(3, 'agent_finished')])
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('thời tiết', askOptions()) })
    await flush()
    const callsWhenDone = getAgentSession.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(6_000) })
    await flush()

    expect(getAgentSession.mock.calls.length).toBe(callsWhenDone)
    expect(result.current.isBusy).toBe(false)
  })

  it('còn dở dang thì còn poll — câu trả lời chậm vẫn về tới nơi', async () => {
    serverReplies(null, [line(1, 'agent_started')])
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('thời tiết', askOptions()) })
    await flush()
    const callsAfterAsk = getAgentSession.mock.calls.length

    await act(async () => { vi.advanceTimersByTime(2_000) })
    await flush()

    expect(getAgentSession.mock.calls.length).toBeGreaterThan(callsAfterAsk)
    expect(result.current.isBusy).toBe(true)
  })

  it('gửi hỏng thì nói rõ trên màn hình chứ không im lặng', async () => {
    askAgent.mockImplementation((_input: unknown, handlers: { onError: (cause: unknown) => void }) => {
      handlers.onError(new Error('mạng hỏng'))
    })
    const { result } = renderHook(() => useObserverSession())

    await act(async () => { result.current.ask('thời tiết', askOptions()) })

    const loi = result.current.rows.find((row) => row.code === 'OBSERVE_FAILED')
    expect(loi?.text).toBe('mạng hỏng')
    expect(result.current.isBusy).toBe(false)
  })
})
