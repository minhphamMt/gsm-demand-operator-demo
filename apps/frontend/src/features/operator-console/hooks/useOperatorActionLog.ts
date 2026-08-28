// Nhật ký thao tác của người vận hành — MA-6.8.
//
// **Cố ý KHÔNG dùng Context.** Kế hoạch dự kiến `InteractionLogContext` với `useReducer`, vì
// lúc viết chưa biết mười handler nằm ở đâu. Kiểm lại thì cả mười đều nằm trong chính
// `OperatorConsoleDashboard` — không có ranh giới component nào để vượt qua, nên một Context
// ở đây là nghi thức chứ không phải cơ chế. Ghi lại để người sau không tưởng là bỏ sót.
//
// Cũng **không** ghi trong `operatorMutations.ts`: file đó dùng chung với màn hình khác, nhét
// log vào là rò nhật ký của bảng điều hành sang nơi không có nhật ký nào.

import { useCallback, useState } from 'react'

import type { LogRow } from '@/features/operator-console/model/logRows'
import {
  failureDetail,
  operatorLogLine,
  type OperatorAction,
} from '@/features/operator-console/model/operatorLog'

export type OperatorActionLog = {
  rows: readonly LogRow[]
  /** Gọi ở `onSuccess`. `detail` là phần đuôi tuỳ chọn, ví dụ mã phương án. */
  noteDone: (action: OperatorAction, detail?: string) => void
  /** Gọi ở `onError`. Nhận thẳng thứ mutation ném ra. */
  noteFailed: (action: OperatorAction, cause: unknown) => void
}

export function useOperatorActionLog(): OperatorActionLog {
  const [rows, setRows] = useState<readonly LogRow[]>([])

  const append = useCallback((action: OperatorAction, ok: boolean, detail?: string, cause?: unknown) => {
    const line = operatorLogLine(action, ok ? 'ok' : 'failed', ok ? detail : failureDetail(cause))
    setRows((current) => [...current, {
      origin: 'action',
      seq: current.length + 1,
      at: new Date().toISOString(),
      kind: ok ? 'operator_action' : 'warning',
      actor: 'operator',
      text: line.text,
      source: 'system',
      ok: line.ok,
      code: line.code,
    }])
  }, [])

  const noteDone = useCallback(
    (action: OperatorAction, detail?: string) => append(action, true, detail),
    [append],
  )
  const noteFailed = useCallback(
    (action: OperatorAction, cause: unknown) => append(action, false, undefined, cause),
    [append],
  )

  return { rows, noteDone, noteFailed }
}
