// Vòng đời một lần chạy đồ thị: khởi động rồi polling 2 giây tới khi DONE/FAILED (MA-4.3).
// Polling chứ không WebSocket — CLAUDE.md §4.2 loại WebSocket khỏi phạm vi.

import { useCallback, useEffect, useRef, useState } from 'react'

import { useOperatorActions, type ForecastHorizon } from '@/features/operator-data'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'

const pollIntervalMs = 2_000

export type PipelineRunState = {
  run: PipelineRunRecord | undefined
  error: string | undefined
  isStarting: boolean
  start: () => void
}

export function usePipelineRun(horizonMinutes: ForecastHorizon, snapshotId: number | undefined): PipelineRunState {
  const actions = useOperatorActions()
  const [run, setRun] = useState<PipelineRunRecord | undefined>()
  const [error, setError] = useState<string | undefined>()
  const refresh = useRef(actions.getPipelineRun)
  refresh.current = actions.getPipelineRun

  useEffect(() => {
    if (!run || run.status === 'DONE' || run.status === 'FAILED') return
    const runId = run.run_id
    const timer = window.setInterval(() => {
      void refresh.current.mutateAsync({ runId }).then(setRun).catch(() => undefined)
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [run])

  const start = useCallback(() => {
    setError(undefined)
    actions.startPipelineRun.mutate(
      { horizonMinutes, ...(snapshotId === undefined ? {} : { snapshotId }) },
      {
        onSuccess: ({ runId }) => {
          setRun({ run_id: runId, status: 'RUNNING' })
          void refresh.current.mutateAsync({ runId }).then(setRun).catch(() => undefined)
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : 'Không khởi động được pipeline.'),
      },
    )
  }, [actions.startPipelineRun, horizonMinutes, snapshotId])

  return { run, error, isStarting: actions.startPipelineRun.isPending, start }
}
