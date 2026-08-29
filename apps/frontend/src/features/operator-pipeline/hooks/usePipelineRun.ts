// Vòng đời một lần chạy đồ thị: khởi động rồi polling 2 giây tới khi DONE/FAILED (MA-4.3).
// Polling chứ không WebSocket — CLAUDE.md §4.2 loại WebSocket khỏi phạm vi.
//
// Hook này sống ở `OperatorConsoleDashboard`, **không** ở trong `PipelineModal` (MA-Q8): panel
// được render dạng `{pipelineOpen && <PipelineModal/>}`, nên để hook ở trong đó thì đóng panel
// là hủy luôn lượt phân tích đang chạy. Một nhật ký chết khi thu gọn thì vô nghĩa.
//
// Sự kiện được **tích lũy** chứ không thay trọn gói. Server gửi cả mảng mỗi lượt poll, nhưng
// khi run bị thu hồi khỏi trần 64 thì nó không gửi nữa — và phần đã tải phải ở lại màn hình.

import { useCallback, useEffect, useRef, useState } from 'react'

import { useOperatorActions, type ForecastHorizon } from '@/features/operator-data'
import { operatorNowIso, type PipelineRunRecord, type RunEvent } from '@/features/operator-pipeline/model/pipelineRun'
import { isRunEvent } from '@/features/operator-pipeline/model/pipelineRunGuard'
import { AppError } from '@/shared/api/client'

const pollIntervalMs = 2_000

export type StartPipelineOptions = {
  horizonMinutes: ForecastHorizon
  snapshotId?: number | undefined
}

export type PipelineRunState = {
  run: PipelineRunRecord | undefined
  events: readonly RunEvent[]
  error: string | undefined
  isStarting: boolean
  start: (options: StartPipelineOptions) => void
}

// Run đã rơi khỏi trần 64 của AI service. Khác hẳn lỗi mạng thoáng qua: 404 là câu trả lời
// dứt khoát "không còn nữa", nên dừng poll; mọi lỗi khác chỉ là một nhịp hụt, thử lại lượt sau.
const isRunGone = (cause: unknown): boolean => cause instanceof AppError && cause.status === 404

// Horizon và snapshot đi vào ở `start()`, không ở chữ ký hook. Hai lý do, cùng chiều nhau:
// `OperatorConsoleDashboard` có ba guard clause trả về sớm (đang tải / lỗi snapshot) đứng
// TRƯỚC chỗ hai giá trị đó được tính, nên hook phải gọi được khi chúng chưa tồn tại; và đọc
// chúng ngay lúc bấm thì không có closure cũ nào để mà lỡ chạy sai horizon.
export function usePipelineRun(): PipelineRunState {
  const actions = useOperatorActions()
  const [run, setRun] = useState<PipelineRunRecord | undefined>()
  const [events, setEvents] = useState<readonly RunEvent[]>([])
  const [isGone, setIsGone] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const refresh = useRef(actions.getPipelineRun)
  refresh.current = actions.getPipelineRun

  // Gộp theo `seq`, không nối đuôi: một response đến muộn hơn response sau nó sẽ không nhân đôi
  // dòng. `seq` là thẩm quyền sắp xếp duy nhất — `at` là đồng hồ tường, trùng được và lùi được.
  const absorb = useCallback((record: PipelineRunRecord) => {
    setRun(record)
    const incoming = (record.events ?? []).filter(isRunEvent)
    if (incoming.length === 0) return
    setEvents((current) => {
      const bySeq = new Map(current.map((event) => [event.seq, event]))
      for (const event of incoming) bySeq.set(event.seq, event)
      return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
    })
  }, [])

  const markGone = useCallback(() => {
    setIsGone(true)
    setEvents((current) => {
      if (current.some((event) => event.code === 'RUN_EVICTED')) return current
      // Nối tiếp `seq` của server là an toàn ở đúng chỗ này: run đã biến mất nên sẽ không còn
      // dòng nào từ server tới để đụng số.
      return [...current, {
        seq: (current.at(-1)?.seq ?? 0) + 1,
        at: operatorNowIso(),
        kind: 'warning',
        actor: 'graph',
        text: 'Máy chủ đã thu hồi lượt chạy này; nhật ký dừng ở đây.',
        source: 'system',
        ok: false,
        code: 'RUN_EVICTED',
      }]
    })
  }, [])

  useEffect(() => {
    if (!run || run.status === 'DONE' || run.status === 'FAILED' || isGone) return
    const runId = run.run_id
    const timer = window.setInterval(() => {
      void refresh.current
        .mutateAsync({ runId })
        .then(absorb)
        .catch((cause: unknown) => {
          // Lỗi mạng thoáng qua không được làm mất dòng nào: bỏ qua nhịp này, giữ nguyên state.
          if (isRunGone(cause)) markGone()
        })
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [run, isGone, absorb, markGone])

  const start = useCallback(({ horizonMinutes, snapshotId }: StartPipelineOptions) => {
    setError(undefined)
    setEvents([])
    setIsGone(false)
    actions.startPipelineRun.mutate(
      { horizonMinutes, ...(snapshotId === undefined ? {} : { snapshotId }) },
      {
        onSuccess: ({ runId }) => {
          setRun({ run_id: runId, status: 'RUNNING' })
          void refresh.current.mutateAsync({ runId }).then(absorb).catch(() => undefined)
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : 'Không khởi động được pipeline.'),
      },
    )
  }, [absorb, actions.startPipelineRun])

  return { run, events, error, isStarting: actions.startPipelineRun.isPending, start }
}
