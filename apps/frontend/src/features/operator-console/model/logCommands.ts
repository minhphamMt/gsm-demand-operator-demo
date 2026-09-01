// Lệnh gạch chéo của ô nhập — mang nếp CLI sang bảng điều hành.
//
// **Mọi lệnh ở đây là lệnh của MÀN HÌNH, không phải lệnh của hệ thống.** Chúng không gọi mạng,
// không sinh directive, không chạm hai cổng §11.1. Đó chính là điều kiện để chúng được xử lý
// trọn vẹn ở client: một lệnh không đi đâu cả thì không có gì để server phải chặn.
//
// Câu không mở đầu bằng `/` đi thẳng tới agent như trước. Câu mở đầu bằng `/` thì **không bao
// giờ** rời khỏi trình duyệt — kể cả khi gõ sai tên. Gửi `/clear` cho LLM là bắt nó đoán một
// thứ người dùng đã nói rõ, và tệ hơn: nó tiêu một lượt gọi model cho một việc của khung nhìn.

import { rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import { eventActorLabel } from '@/features/operator-pipeline/model/agentTasks'
import { eventClock } from '@/features/operator-pipeline/model/pipelineRun'

export type ConsoleCommand =
  | { kind: 'ask'; text: string }
  | { kind: 'clear' }
  | { kind: 'help' }
  | { kind: 'export' }
  | { kind: 'gates' }
  | { kind: 'status' }
  | { kind: 'unknown'; name: string }

export type ConsoleCommandInfo = { name: string; summary: string }

/** Bảng lệnh — cũng là nội dung `/help` **và** nội dung menu gõ `/`, nên ba chỗ không lệch nhau
 * được. Thêm một lệnh là sửa đúng một nơi này. */
export const consoleCommands: readonly ConsoleCommandInfo[] = [
  { name: '/clear', summary: 'xoá nhật ký khỏi màn hình — bản ghi ở CSDL không đổi' },
  { name: '/export', summary: 'chép nhật ký đang hiện vào clipboard' },
  { name: '/gates', summary: 'bật/tắt chế độ chỉ hiện quyết định của con người' },
  { name: '/status', summary: 'mốc đang xem, regime, dự báo, phương án, bước hiện tại' },
  { name: '/help', summary: 'bảng này' },
]

/** Lệnh khớp với phần đang gõ dở, cho menu bật lên khi gõ `/`. Rỗng nghĩa là không mở menu.
 *
 * Ba ca đóng menu, và cả ba đều cố ý:
 * · không mở đầu bằng `/` — người ta đang viết câu hỏi cho agent, gợi ý lệnh chỉ làm vướng;
 * · đã có khoảng trắng — tên lệnh gõ xong rồi, menu tên lệnh hết việc;
 * · không khớp gì — `/xyz` thì để họ Enter và đọc câu "không có lệnh", rõ hơn một menu trống.
 */
export function commandMenuMatches(draft: string): readonly ConsoleCommandInfo[] {
  if (!draft.startsWith('/') || /\s/.test(draft)) return []
  const prefix = draft.toLowerCase()
  return consoleCommands.filter((command) => command.name.startsWith(prefix))
}

export function parseConsoleCommand(raw: string): ConsoleCommand {
  const text = raw.trim()
  if (!text.startsWith('/')) return { kind: 'ask', text }
  // Chỉ đọc từ đầu tiên: `/clear ` gõ thừa dấu cách vẫn là `/clear`.
  const name = text.split(/\s+/)[0]!.toLowerCase()
  switch (name) {
    case '/clear':
      return { kind: 'clear' }
    case '/export':
      return { kind: 'export' }
    case '/gates':
      return { kind: 'gates' }
    case '/status':
      return { kind: 'status' }
    case '/help':
    case '/?':
      return { kind: 'help' }
    default:
      return { kind: 'unknown', name }
  }
}

/** Nội dung `/help`. Dựng từ `consoleCommands` nên thêm lệnh là bảng tự dài ra.
 *
 * Ba dòng cuối cố ý nằm trong `/help` chứ không nằm trong tài liệu: người vận hành đi tìm
 * "làm sao duyệt từ đây" sẽ gõ `/help` trước khi mở bất cứ tài liệu nào, và câu trả lời đúng
 * là *không duyệt được từ đây*. Nói ở chỗ họ hỏi thì họ không phải thử.
 */
export function helpText(): string {
  const width = Math.max(...consoleCommands.map((command) => command.name.length))
  const lines = consoleCommands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`)
  return [
    'Lệnh của màn hình — không gửi tới agent:',
    ...lines,
    `  ${'↑ / ↓'.padEnd(width)}  gọi lại câu đã gõ`,
    '',
    'Gõ / để menu lệnh bật lên — ↑↓ chọn, Tab điền nốt tên, Enter chạy, Esc đóng.',
    'Gõ câu thường để hỏi agent, ví dụ: chạy phân tích · zone nào đang thiếu xe.',
    '/export chép đúng phần đang hiện, nên bật /gates trước rồi /export sẽ ra biên bản quyết định.',
    'Phê duyệt và phát hành campaign KHÔNG gõ được ở đây — hai cổng đó chỉ mở bằng nút bấm.',
  ].join('\n')
}

export function gatesText(isOn: boolean, matchCount: number): string {
  // Câu tắt nói rõ "đã hiện lại đủ" vì bộ lọc là trạng thái dính: người bật nó rồi quên là mất
  // hẳn phần còn lại của nhật ký, và dòng này là chỗ họ đọc để biết mình vừa thoát khỏi đó.
  if (!isOn) return 'đã tắt bộ lọc — nhật ký hiện lại đủ.'
  return matchCount === 0
    ? 'chỉ hiện quyết định của con người — chưa có quyết định nào. Gõ /gates lần nữa để tắt.'
    : `chỉ hiện quyết định của con người — ${matchCount} dòng. Gõ /gates lần nữa để tắt.`
}

/** Dấu xoá: tập dòng đang hiện lúc gõ `/clear`, kèm mốc thời gian lúc đó.
 *
 * Cần **cả hai** vế, vì một mình vế nào cũng giấu nhầm:
 *
 * · Chỉ theo khoá thì hụt ở lượt chạy mới. `usePipelineRun.start()` gọi `setEvents([])`, nên
 *   `seq` của nguồn `run` đếm lại từ 1 — `run-1` của lượt sau trùng khoá với `run-1` của lượt
 *   trước, và cả lượt chạy mới sẽ chào đời trong trạng thái bị giấu.
 *
 * · Chỉ theo thời gian thì hụt trong cùng một giây. `operatorNowIso()` cắt tới giây, nên một
 *   dòng agent về đúng giây người ta gõ `/clear` sẽ bị giấu vĩnh viễn dù chưa ai đọc nó.
 *
 * Ghép lại thì điều kiện giấu đọc đúng nghĩa tiếng Việt của nó: *đã ở trên màn hình* **và**
 * *không mới hơn lúc xoá*.
 */
export type ClearMark = { readonly keys: ReadonlySet<string>; readonly atMs: number }

export function clearMark(rows: readonly LogRow[], atIso: string): ClearMark {
  return { keys: new Set(rows.map(rowKey)), atMs: Date.parse(atIso) || 0 }
}

/** Lọc theo dấu xoá, **trừ dòng chờ duyệt còn treo**.
 *
 * Ngoại lệ đó không phải để cho tiện. Dòng chờ là lời nhắc duy nhất trong nhật ký rằng hệ
 * thống đang đứng im đợi một con người (§11.1); giấu nó đi là biến `/clear` thành cách vô
 * tình bỏ quên một phương án chưa duyệt. Xoá màn hình được phép làm mất *tin đã đọc*, không
 * được phép làm mất *việc chưa làm*.
 */
export function visibleRows(
  rows: readonly LogRow[],
  mark: ClearMark | null,
  liveAwaitingSeq: number | null,
): readonly LogRow[] {
  if (!mark) return rows
  return rows.filter((row) => {
    if (row.kind === 'awaiting_approval' && row.seq === liveAwaitingSeq) return true
    if (!mark.keys.has(rowKey(row))) return true
    return (Date.parse(row.at) || 0) > mark.atMs
  })
}

export function clearedText(hiddenCount: number, keptAwaiting: boolean): string {
  const kept = keptAwaiting ? ' — giữ lại dòng chờ duyệt' : ''
  // Câu này nói rõ giới hạn của lệnh vì §9 #5: nhật ký là để debug và mất được, còn quyết định
  // nghiệp vụ nằm ở History Store append-only. Người vận hành gõ `/clear` phải biết mình vừa
  // dọn màn hình, không phải vừa xoá dấu vết.
  return `đã xoá ${hiddenCount} dòng khỏi màn hình${kept}. Bản ghi kiểm toán ở CSDL không đổi.`
}

/** Dòng ghi lại **một con người vừa quyết định điều gì**, dùng cho `/gates`.
 *
 * Tập này không tự nghĩ ra: nó là đúng danh sách CLAUDE.md §3 #7 buộc phải vào History Store —
 * *plan, revise, approve/reject, **và phản hồi tài xế***. Lấy theo định nghĩa của chính dự án
 * thì bộ lọc không thành ý thích của người viết code, và khi §3 #7 đổi thì chỗ phải sửa là rõ.
 *
 * Tài xế nhận/từ chối được tính là quyết định của con người, dù **không** phải một cổng §11.1:
 * đó là quyền của tài xế (C-08), và bỏ nó ra khỏi khung nhìn "ai đã quyết định gì" là kể thiếu
 * đúng một nửa vòng phản hồi đóng ở FR-13.
 *
 * Dòng của chính ô nhập luôn lọt qua: bộ lọc mà nuốt mất câu xác nhận của chính nó thì người
 * gõ `/gates` trên một nhật ký chưa có quyết định nào sẽ thấy màn hình trống trơn không lời
 * giải thích — và kết luận hợp lý nhất lúc đó là màn hình hỏng.
 */
export function isDecisionRow(row: LogRow): boolean {
  if (row.origin === 'console') return true
  if (row.kind === 'awaiting_approval') return true
  if (row.origin === 'action') return true
  return row.origin === 'audit' && (row.actor === 'operator' || row.actor === 'driver')
}

const stageLabels: Record<string, string> = {
  observe: 'đang quan sát',
  forecast: 'đã có dự báo, chưa tính phương án',
  not_required: 'không cần điều chuyển',
  plan: 'đã có phương án, chờ duyệt',
  no_solution: 'không tìm được phương án',
  approved: 'đã duyệt, chờ phát lệnh',
  executing: 'đang thực thi',
  executed: 'đã thực thi xong',
  activation_draft: 'đang soạn campaign',
  campaign: 'campaign đang chạy',
}

const regimeLabels: Record<string, string> = {
  normal: 'thường',
  peak: 'cao điểm',
  rain: 'mưa',
  rain_peak: 'mưa + cao điểm',
}

/** Trạng thái vận hành mà `/status` in ra. Dữ liệu thuần, do bảng điều hành truyền xuống —
 * popup nhật ký không tự đi hỏi bất cứ query nào, nếu không nó sẽ có một nguồn sự thật thứ
 * hai cạnh màn hình chính và hai bên lệch nhau đúng lúc người ta cần tin nhất. */
export type ConsoleStatus = {
  observedAt: string
  isLiveEdge: boolean
  isStale: boolean
  regime: string
  zoneCount: number
  missingZoneCount: number
  forecastReady: boolean
  horizonMinutes: number
  stage: string
  plan?: { id: string; version: number; status: string } | undefined
  awaitingApproval: boolean
}

export function statusText(status: ConsoleStatus): string {
  const observed = [
    eventClock(status.observedAt),
    status.isLiveEdge ? 'mốc mới nhất' : 'đang xem lại mốc cũ',
    regimeLabels[status.regime] ?? status.regime,
    // Regime thô đi kèm nhãn tiếng Việt vì `rain_peak` là thước đo thành công chính (§3 #6) và
    // mọi báo cáo gọi nó bằng tên thô — người đọc phải nối được hai cách gọi.
    `(${status.regime})`,
  ]
  if (status.isStale) observed.push('· CŨ, cần làm mới')

  const data = status.missingZoneCount === 0
    ? `đủ ${status.zoneCount}/${status.zoneCount} zone`
    : `THIẾU ${status.missingZoneCount}/${status.zoneCount} zone`

  const forecast = status.forecastReady
    ? `đã có cho horizon ${status.horizonMinutes} phút`
    : `chưa có cho horizon ${status.horizonMinutes} phút`

  const plan = status.plan
    ? `${status.plan.id} v${status.plan.version} · ${status.plan.status}${status.awaitingApproval ? ' · CHỜ BẠN DUYỆT' : ''}`
    : 'chưa có'

  const rows: readonly [string, string][] = [
    ['Mốc đang xem', observed.join(' · ')],
    ['Dữ liệu', data],
    ['Dự báo', forecast],
    ['Phương án', plan],
    ['Bước', stageLabels[status.stage] ?? status.stage],
  ]
  const width = Math.max(...rows.map(([label]) => label.length))
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n')
}

/** Nhật ký dạng chữ để chép ra ngoài — đúng khuôn đang hiện trên màn hình. */
export function exportText(rows: readonly LogRow[]): string {
  return rows
    .map((row) => row.origin === 'operator' || row.kind === 'operator_message'
      ? `[${eventClock(row.at)}] > ${row.text}`
      : `[${eventClock(row.at)}] [${eventActorLabel(row)}] > ${row.text}`)
    .join('\n')
}
