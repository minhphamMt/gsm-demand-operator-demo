// Hợp nhất các nguồn sự kiện thành một dòng chảy đọc được — Chặng 2 + Chặng 7.
//
// Popup nhật ký nhận sự kiện từ ba nơi có vòng đời khác hẳn nhau:
//   · `run`      — lượt chạy đồ thị, `seq` do AI service cấp
//   · `session`  — phiên hỏi–đáp với agent quan sát, `seq` riêng, bắt đầu lại từ 1
//   · `operator` — câu người vận hành vừa gõ, client tự đánh số
//
// Luật sắp xếp: **trong cùng một nguồn thì theo `seq`; giữa các nguồn thì theo `at`.**
//
// Vế đầu là bắt buộc — `at` là đồng hồ tường, trùng được ở mức mili-giây và lùi được khi NTP
// chỉnh giờ, nên trong một nguồn nó không đủ tin. Vế sau là lựa chọn có ý thức: hai nguồn
// đánh số độc lập nên không có thứ tự chung nào ngoài thời gian, và lệch một mili-giây giữa
// một dòng pipeline với một dòng hội thoại thì không đổi nghĩa của gì cả.

import type { RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

export type LogOrigin = 'run' | 'session' | 'operator'

export type LogRow = RunEvent & { origin: LogOrigin }

/** Khoá React ổn định. `seq` chỉ duy nhất trong một nguồn nên phải ghép cả nguồn vào. */
export function rowKey(row: LogRow): string {
  return `${row.origin}-${row.seq}`
}

export function mergeLogRows(
  runEvents: readonly RunEvent[],
  sessionRows: readonly LogRow[],
): readonly LogRow[] {
  const rows: LogRow[] = [
    ...runEvents.map((event): LogRow => ({ ...event, origin: 'run' })),
    ...sessionRows,
  ]
  // `sort` của JS ổn định, nên hai dòng cùng mốc `at` giữ nguyên thứ tự đã xếp ở trên —
  // và trong cùng một nguồn, thứ tự đó chính là thứ tự `seq`.
  return rows.sort((left, right) => {
    if (left.origin === right.origin) return left.seq - right.seq
    return left.at < right.at ? -1 : left.at > right.at ? 1 : 0
  })
}
