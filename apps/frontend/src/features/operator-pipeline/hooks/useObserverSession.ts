// Phiên hỏi–đáp giữa người vận hành và agent quan sát — Chặng 7.
//
// Hook giữ **allowlist riêng của client** cho directive mà server gửi về. Server đã không
// sinh ra được directive nào ngoài `start_run`, và ở đây kiểm lại lần nữa: hai khoá, một não.
// Một `action` lạ — do server đổi, do proxy chèn, do bất cứ đâu — bị bỏ qua chứ không thi hành.
//
// Poll dừng theo **hợp đồng của server**, không theo đồng hồ: mỗi câu hỏi mở bằng
// `agent_started` và luôn đóng bằng `agent_finished`, kể cả khi hỏng. Hook đếm hai loại đó.
// Đếm thay vì đặt hẹn giờ nghĩa là một câu trả lời chậm 30 giây vẫn về tới nơi.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useOperatorActions, type ForecastHorizon } from '@/features/operator-data'
import type { LogRow } from '@/features/operator-console/model/logRows'
import { operatorNowIso } from '@/features/operator-pipeline/model/pipelineRun'
import { isRunEvent } from '@/features/operator-pipeline/model/pipelineRunGuard'

const pollIntervalMs = 2_000

// Trần vòng poll cho một câu hỏi. Chốt chặn cứng phòng khi `agent_finished` không bao giờ tới
// (tiến trình AI chết giữa chừng): không có nó thì popup poll mãi mãi.
const maxPollsPerAsk = 30

export type AskOptions = {
  horizonMinutes: ForecastHorizon
  snapshotId?: number | undefined
  /** Việc client sẵn lòng làm, khoá theo tên directive.
   *
   * **Chính map này LÀ allowlist.** Server chỉ sinh ra ba directive, và ở đây kiểm lần nữa:
   * directive không có handler thì không có gì chạy — không cần một danh sách thứ hai để rồi
   * hai bên lệch nhau. Map này KHÔNG bao giờ được chứa việc chạm cổng phê duyệt hay chạm
   * tiền; hai thứ đó chỉ đi qua nút bấm (§11.1).
   */
  handlers: Readonly<Record<string, () => void>>
}

export type ObserverSession = {
  rows: readonly LogRow[]
  isBusy: boolean
  ask: (text: string, options: AskOptions) => void
}

function newSessionId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return random ?? `S-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

// Tham số của một câu hỏi đi vào ở `ask()`, không ở chữ ký hook — cùng lý do như
// `usePipelineRun`: `OperatorConsoleDashboard` có ba guard clause trả về sớm đứng TRƯỚC chỗ
// horizon và snapshot được tính, nên hook phải gọi được khi chúng chưa tồn tại.
export function useObserverSession(): ObserverSession {
  const actions = useOperatorActions()
  const sessionId = useRef<string>(newSessionId())
  const [serverRows, setServerRows] = useState<readonly LogRow[]>([])
  const [operatorRows, setOperatorRows] = useState<readonly LogRow[]>([])
  const [pollsLeft, setPollsLeft] = useState(0)

  const send = useRef(actions.askAgent)
  send.current = actions.askAgent
  const fetchSession = useRef(actions.getAgentSession)
  fetchSession.current = actions.getAgentSession

  const absorb = useCallback((events: readonly unknown[]) => {
    const rows = events.filter(isRunEvent).map((event): LogRow => ({ ...event, origin: 'session' }))
    setServerRows(rows)
    // Server luôn đóng một câu trả lời bằng `agent_finished`. Còn dở dang thì còn poll.
    const started = rows.filter((row) => row.kind === 'agent_started').length
    const finished = rows.filter((row) => row.kind === 'agent_finished').length
    if (started <= finished) setPollsLeft(0)
  }, [])

  useEffect(() => {
    if (pollsLeft <= 0) return
    const timer = window.setInterval(() => {
      setPollsLeft((left) => left - 1)
      void fetchSession.current
        .mutateAsync({ sessionId: sessionId.current })
        .then(absorb)
        .catch(() => undefined)
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [pollsLeft, absorb])

  const ask = useCallback((text: string, { horizonMinutes, snapshotId, handlers }: AskOptions) => {
    const trimmed = text.trim()
    if (!trimmed) return
    // Hiện câu vừa gõ ngay lập tức. Server cố ý KHÔNG echo lại, nên không có bản thứ hai.
    setOperatorRows((current) => [...current, {
      origin: 'operator',
      seq: current.length + 1,
      at: operatorNowIso(),
      kind: 'operator_message',
      actor: 'operator',
      text: trimmed,
      source: 'system',
    }])
    setPollsLeft(maxPollsPerAsk)

    send.current.mutate(
      { sessionId: sessionId.current, text: trimmed, horizonMinutes, snapshotId },
      {
        onSuccess: ({ action }) => {
          const run = action ? handlers[action] : undefined
          if (run) run()
          void fetchSession.current.mutateAsync({ sessionId: sessionId.current }).then(absorb).catch(() => undefined)
        },
        onError: (cause) => {
          setPollsLeft(0)
          setServerRows((current) => [...current, {
            origin: 'session',
            seq: (current.at(-1)?.seq ?? 0) + 1,
            at: operatorNowIso(),
            kind: 'warning',
            actor: 'observer',
            text: cause instanceof Error ? cause.message : 'Không gửi được câu hỏi.',
            source: 'system',
            ok: false,
            code: 'OBSERVE_FAILED',
          }])
        },
      },
    )
  }, [absorb])

  const rows = useMemo(
    () => [...operatorRows, ...serverRows].sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0)),
    [operatorRows, serverRows],
  )

  return { rows, isBusy: pollsLeft > 0 || send.current.isPending, ask }
}
