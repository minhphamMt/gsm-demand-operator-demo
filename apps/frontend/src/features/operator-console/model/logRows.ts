// Hợp nhất các nguồn sự kiện thành một dòng chảy đọc được — Chặng 2 + Chặng 7.
//
// Popup nhật ký nhận sự kiện từ ba nơi có vòng đời khác hẳn nhau:
//   · `run`      — lượt chạy đồ thị, `seq` do AI service cấp
//   · `session`  — phiên hỏi–đáp với agent quan sát, `seq` riêng, bắt đầu lại từ 1
//   · `operator` — câu người vận hành vừa gõ, client tự đánh số
//   · `action`   — thao tác người vận hành đã bấm, ghi khi biết kết quả (MA-6.8)
//   · `audit`    — bản ghi đã bền hoá ở DB, gồm cả bước sau duyệt và phản hồi tài xế (MA-6.9)
//   · `gate`     — dòng chờ người duyệt, dựng từ chính phương án trong CSDL (Chặng 6)
//
// `operator` và `action` tách nhau chứ không gộp: một câu gõ vào là *ý muốn*, một thao tác đã
// xong là *sự việc*. Trên màn hình chúng cũng hiện khác nhau, và trộn lại là làm mờ đúng chỗ
// người đọc cần phân biệt.
//
// Luật sắp xếp: **trong cùng một nguồn thì theo `seq`; giữa các nguồn thì theo `at`.**
//
// Vế đầu là bắt buộc — `at` là đồng hồ tường, trùng được ở mức mili-giây và lùi được khi NTP
// chỉnh giờ, nên trong một nguồn nó không đủ tin. Vế sau là lựa chọn có ý thức: hai nguồn
// đánh số độc lập nên không có thứ tự chung nào ngoài thời gian, và lệch một mili-giây giữa
// một dòng pipeline với một dòng hội thoại thì không đổi nghĩa của gì cả.

import { APPROVAL_RESOLVING_CODES } from '@/features/operator-console/model/operatorLog'
import type { RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

export type LogOrigin = 'run' | 'session' | 'operator' | 'action' | 'audit' | 'gate'

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
    // So bằng `Date.parse`, KHÔNG so chuỗi: các nguồn mang offset khác nhau — AI service dùng
    // `+07:00`, Postgres trả `+00:00`. So chuỗi thì `...T04:20+00:00` nhỏ hơn `...T11:20+07:00`
    // dù hai cái là **cùng một khoảnh khắc**, và mọi dòng audit bị đẩy lên đầu nhật ký.
    return (Date.parse(left.at) || 0) - (Date.parse(right.at) || 0)
  })
}

/** `seq` của dòng chờ duyệt còn đang treo, hoặc `null` nếu không có vòng chờ nào đang mở.
 *
 * Vòng chờ đóng khi người vận hành **duyệt hoặc từ chối** — hai việc kết thúc cổng §11.1.
 * Lưu bản chỉnh sửa thì không: nó sinh ra v2, và v2 vẫn phải được duyệt. Coi `revise` là đã
 * xong sẽ tắt dòng chờ đúng lúc vẫn còn phải chờ.
 */
export function liveAwaitingSeq(rows: readonly LogRow[]): number | null {
  const index = rows.findLastIndex((row) => row.kind === 'awaiting_approval')
  if (index < 0) return null
  const resolved = rows
    .slice(index + 1)
    .some((row) => row.code !== null && row.code !== undefined && APPROVAL_RESOLVING_CODES.includes(row.code))
  return resolved ? null : (rows[index]?.seq ?? null)
}

/** Dòng "đang chờ bạn duyệt", dựng từ phương án thật trong CSDL.
 *
 * Dựng ở client chứ không ở AI service, và đó là chỗ đúng: `POST /runs` chạy đồ thị trong bộ
 * nhớ rồi trả kết quả, **không ghi phương án nào**. AI service vì thế không biết có thứ gì để
 * duyệt hay không — chỉ `plans` mới biết. Đặt dòng chờ ở đó là hứa một cổng có thể không tồn
 * tại, và người vận hành sẽ ngồi đợi một nút không bao giờ hiện ra.
 *
 * `at` lấy từ chính phương án, không phải `Date.now()`: mốc phải ổn định qua mỗi lần render,
 * nếu không dòng sẽ nhảy chỗ mỗi hai giây theo nhịp poll.
 */
export function awaitingApprovalRow(
  plan: { id: string; createdAt: string } | undefined,
  canReview: boolean,
): readonly LogRow[] {
  if (!plan || !canReview) return []
  return [{
    // Nguồn riêng, không phải `action`. Trong cùng một nguồn thì `seq` thắng, nên nhét nó vào
    // `action` sẽ ghim nó trước mọi thao tác bất kể thời điểm. Nguồn riêng thì nó sắp theo
    // `at` như mọi nguồn độc lập khác — tức đúng chỗ nó xảy ra.
    origin: 'gate',
    seq: 1,
    at: plan.createdAt,
    kind: 'awaiting_approval',
    actor: 'graph',
    text: `⏸ chờ người vận hành duyệt ${plan.id} — hệ thống không tự quyết`,
    source: 'system',
    code: 'AWAITING_APPROVAL',
  }]
}

/** Bỏ những dòng chỉ tồn tại cho máy, giữ lại những dòng nói với người.
 *
 * `agent_started` và `agent_finished` của một phiên hỏi–đáp là **hợp đồng để client biết khi
 * nào ngừng poll** — hook đếm hai loại đó. Chúng cần thiết trên dây, nhưng đọc ra thành
 * "đọc câu hỏi của điều phối viên" rồi "trả lời xong" thì chỉ là tiếng ồn kẹp quanh câu trả
 * lời thật, và làm một cuộc hội thoại đọc như một bản dump.
 *
 * Cùng hai loại đó ở nguồn `run` thì **giữ**: ở đó chúng đánh dấu từng chặng của đồ thị —
 * Forecast, Dispatch, Optimization — tức đúng thứ người xem muốn thấy.
 */
/** Những agent đang chạy dở — mỗi `agent_started` chưa có `agent_finished` khớp.
 *
 * Giữa lúc gõ xong một câu và lúc câu trả lời hiện ra là một khoảng lặng dài vài giây: LLM
 * đang nghĩ, tool đang đọc parquet, optimizer đang giải. Trước đây khoảng đó **không có gì**
 * trên màn hình, nên nó không phân biệt được với "hệ thống chết" — người vận hành chỉ còn
 * cách gõ lại câu vừa gõ.
 *
 * Ghép khoá theo `origin` **và** `actor`, không đếm tổng started/finished: đồ thị chạy nhiều
 * agent nối nhau, đếm tổng chỉ biết "còn ai đó đang chạy" chứ không biết **ai** — mà cái tên
 * mới là thứ đáng hiện. Dùng `Map` nên một agent chạy lại sẽ ghi đè lượt cũ thay vì mọc thêm
 * một dòng chờ thứ hai.
 *
 * Đọc từ hàng **chưa lọc**: `conversationRows` bỏ đúng `agent_started` của phiên hỏi–đáp, nên
 * lọc trước rồi mới suy ra ở đây thì luôn ra rỗng — đúng ở ca ít quan trọng nhất và sai ở ca
 * người dùng phàn nàn.
 */
export function thinkingRows(rows: readonly LogRow[]): readonly LogRow[] {
  const open = new Map<string, LogRow>()
  for (const row of rows) {
    if (row.kind !== 'agent_started' && row.kind !== 'agent_finished') continue
    const key = `${row.origin}:${row.actor}`
    if (row.kind === 'agent_started') open.set(key, row)
    else open.delete(key)
  }
  return [...open.values()]
}

export function conversationRows(rows: readonly LogRow[]): readonly LogRow[] {
  return rows.filter(
    (row) => !(row.origin === 'session' && (row.kind === 'agent_started' || row.kind === 'agent_finished')),
  )
}
