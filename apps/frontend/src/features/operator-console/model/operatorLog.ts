// Thao tác của người vận hành, dựng thành dòng nhật ký — MA-6.8.
//
// Mắt xích này lấp một khoảng lặng nhìn thấy được: trước nó, người vận hành gõ lệnh (có
// trong log), agent chạy (có trong log), rồi họ bấm Phê duyệt — và log im bặt đúng lúc con
// người ra quyết định. Mạch ở §1 đọc không ra nếu thiếu vế "người duyệt".
//
// **Ghi tại `onSuccess`/`onError`, không phải lúc bấm.** Bấm là ý định, không phải sự việc:
// một lần bấm rồi hỏng mà log ghi "đã phê duyệt" là ghi sai chuyện đã xảy ra. Đây cũng là lý
// do mỗi hành động có sẵn hai câu chữ, không phải một câu cộng thêm chữ "lỗi" ở đuôi.
//
// Module thuần: không gọi mạng, không đụng state, không biết React.

export type OperatorAction =
  | 'forecast'
  | 'optimize'
  | 'approve'
  | 'reject'
  | 'revise'
  | 'activate'
  | 'release_dispatch'
  | 'cancel_plan'
  | 'stop_execution'
  | 'retry_move'

export type OperatorOutcome = 'ok' | 'failed'

export type OperatorLogLine = {
  text: string
  ok: boolean
  code: string | null
}

// Hai mã dưới đây đánh dấu đúng hai cổng người-duyệt của §11.1. Chúng có mã riêng để nhật ký
// phân biệt được "một quyết định của con người" với "một thao tác điều hướng" — trộn hai thứ
// đó vào cùng một kiểu dòng là làm mờ đúng chỗ cần rõ nhất khi đọc lại về sau.
export const GATE_PLAN_CODE = 'GATE_PLAN_APPROVED'
export const GATE_CAMPAIGN_CODE = 'GATE_CAMPAIGN_CONFIRMED'

const wording: Record<OperatorAction, { done: string; failed: string; code?: string }> = {
  forecast: { done: 'đã chạy dự báo', failed: 'chạy dự báo không thành' },
  optimize: { done: 'đã yêu cầu tối ưu phương án', failed: 'tối ưu phương án không thành' },
  approve: { done: 'đã phê duyệt phương án', failed: 'phê duyệt không thành', code: GATE_PLAN_CODE },
  reject: { done: 'đã từ chối phương án', failed: 'từ chối không thành' },
  revise: { done: 'đã lưu bản chỉnh sửa', failed: 'lưu bản chỉnh sửa không thành' },
  activate: { done: 'đã xác nhận phát hành campaign', failed: 'phát hành campaign không thành', code: GATE_CAMPAIGN_CODE },
  release_dispatch: { done: 'đã phát lệnh điều xe', failed: 'phát lệnh điều xe không thành' },
  cancel_plan: { done: 'đã hủy phương án đã duyệt', failed: 'hủy phương án không thành' },
  stop_execution: { done: 'đã dừng lượt đang thực thi', failed: 'dừng lượt thực thi không thành' },
  retry_move: { done: 'đã cho chạy lại một chặng lỗi', failed: 'chạy lại chặng không thành' },
}

export function operatorLogLine(
  action: OperatorAction,
  outcome: OperatorOutcome,
  detail?: string | undefined,
): OperatorLogLine {
  const entry = wording[action]
  if (outcome === 'ok') {
    return {
      text: detail ? `${entry.done} ${detail}` : entry.done,
      ok: true,
      code: entry.code ?? null,
    }
  }
  // Lý do hỏng đi vào cùng dòng chứ không bị nuốt: người đọc log cần biết vì sao, và họ đang
  // đọc đúng chỗ lẽ ra phải có một quyết định (CLAUDE.md §9 #3).
  return {
    text: detail ? `${entry.failed} — ${detail}` : entry.failed,
    ok: false,
    code: null,
  }
}

/** Lý do hỏng dạng chữ, từ bất cứ thứ gì một mutation ném ra. */
export function failureDetail(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim()
  return 'lỗi không xác định'
}
