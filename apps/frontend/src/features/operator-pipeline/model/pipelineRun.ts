// Kiểu dữ liệu cho một run của tầng điều phối multi-agent.
// Backend: POST /api/v1/runs · GET /api/v1/runs/{id} (apps/ai/src/api/routes_orchestration.py),
// được NestJS proxy qua /operator/ai/runs (apps/backend/src/ai/ai.controller.ts).

export type AgentStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'WARNING' | 'FAILED'

export type CapabilityKey = 'forecast' | 'traffic' | 'supply'

export type PipelineAgent = {
  status: AgentStatus
  message: string
  capabilities: Partial<Record<CapabilityKey, { status: AgentStatus; message: string }>>
  // `agent/02-technical-spec.md` §2.5 (`AgentResult`). Optional vì run cũ trong bộ nhớ của
  // tiến trình AI có thể chưa có hai field này.
  started_at?: string | null
  finished_at?: string | null
}

/** Thời lượng chạy của một agent, tính bằng giây. `null` khi chưa đủ hai mốc. */
export function agentDurationSeconds(agent: PipelineAgent | undefined): number | null {
  if (!agent?.started_at || !agent.finished_at) return null
  const started = Date.parse(agent.started_at)
  const finished = Date.parse(agent.finished_at)
  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) return null
  return Math.round(((finished - started) / 1000) * 10) / 10
}

export type PipelineToolCall = {
  agent: string
  tool: string
  ok: boolean
  detail: string
}

// Một dòng nhật ký của lượt chạy — `apps/ai/src/orchestration/run_log.py`.
//
// `kind` và `source` cố ý khai báo là `string` chứ không phải union đóng: Chặng 6–7 sẽ thêm
// `awaiting_approval`, `approval_resolved`, `operator_message`, và một client cũ gặp kind lạ
// phải hiện dòng đó chứ không được bỏ. Union bên dưới là để *đọc*, không để *chặn*.
export type RunEventKind =
  | 'run_started'
  | 'agent_started'
  | 'agent_finished'
  | 'tool_started'
  | 'tool_finished'
  | 'tool_denied'
  | 'narration'
  | 'warning'
  | 'run_finished'

export type RunEventSource = 'deterministic' | 'llm' | 'system'

export type RunEvent = {
  seq: number
  at: string
  kind: string
  actor: string
  text: string
  source: string
  tool?: string | null
  ok?: boolean | null
  code?: string | null
}

// Múi giờ vận hành, cố định. Mọi dòng nhật ký hiện theo nó, bất kể máy đang xem ở đâu — hai
// người ở hai múi giờ phải đọc ra cùng một mốc cho cùng một sự kiện.
const OPERATIONS_TIMEZONE = 'Asia/Ho_Chi_Minh'

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: OPERATIONS_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Mốc "bây giờ" theo giờ vận hành, cùng khuôn với `now_iso()` của AI service.
 *
 * Cần cho **sắp xếp**, không chỉ hiển thị: `mergeLogRows` so mốc giữa các nguồn, và một dòng
 * client mang `Z` nằm cạnh dòng server mang `+07:00` là hai quy ước trong một dòng chảy.
 *
 * Việt Nam là UTC+7 cố định, không có giờ mùa hè, nên phép cộng này đủ và không cần thư viện.
 */
export function operatorNowIso(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return `${shifted.toISOString().slice(0, 19)}+07:00`
}

/** Giờ hiển thị `HH:MM:SS` của một mốc ISO, quy về giờ vận hành.
 *
 * **Đổi múi giờ, không cắt chuỗi.** Bản trước cắt thẳng ký tự 11–19 vì giả định mốc luôn mang
 * offset +07:00 — đúng với sự kiện của AI service, nhưng sai với bản ghi audit: Postgres trả
 * `+00:00`, nên chúng hiện lệch đúng 7 tiếng ngay cạnh những dòng khác trong cùng nhật ký.
 *
 * Vẫn không dùng múi giờ của máy đang xem: `timeZone` được ghim, nên kết quả không phụ thuộc
 * người mở màn hình đang ngồi đâu.
 */
export function eventClock(at: string): string {
  const instant = Date.parse(at)
  return Number.isNaN(instant) ? '--:--:--' : clockFormat.format(instant)
}

export type PipelinePlan = {
  plan_id: string
  strategy: string
  move_count: number
  total_units: number
  total_cost: number
  total_eta_step_units: number
  residual_zone_count: number
}

export type PipelinePlanSet = {
  plans: PipelinePlan[]
  converged: boolean
  distinct_plan_count: number
}

export type PipelineWarning = {
  code?: string
  severity?: string
  message: string
  [key: string]: unknown
}

export type PipelineExplanation = {
  text: string
  source_values?: Record<string, unknown>
  layer: 'template' | 'llm'
}

export type PipelineRunRecord = {
  run_id: string
  status: 'RUNNING' | 'DONE' | 'FAILED'
  routing_mode?: 'deterministic' | 'llm'
  policy_version?: string
  model_version?: string
  agents?: Record<string, PipelineAgent>
  tool_calls?: PipelineToolCall[]
  plan_set?: PipelinePlanSet
  recommended_plan_id?: string
  quality_ok?: boolean
  quality_reason?: string
  explanation?: PipelineExplanation
  warnings?: PipelineWarning[]
  decision?: Record<string, unknown>
  error?: { code: string; message: string }
  // Field optional, thêm ở MA-6.5 — CLAUDE.md §3 #1 cấm sửa field cũ sau W2.
  events?: readonly RunEvent[]
}

export const agentDisplayOrder = ['situation_assessment', 'dispatch', 'optimization', 'explanation'] as const

export const agentLabel: Record<string, string> = {
  situation_assessment: 'Situation Assessment',
  dispatch: 'Dispatch',
  optimization: 'Optimization',
  explanation: 'Explanation',
}

export const capabilityLabel: Record<CapabilityKey, string> = {
  forecast: 'Forecast',
  traffic: 'Traffic',
  supply: 'Supply',
}

export function planSummary(planSet: PipelinePlanSet | undefined, recommendedPlanId: string | undefined): string {
  const plan = (planSet?.plans ?? []).find((candidate) => candidate.plan_id === recommendedPlanId) ?? planSet?.plans[0]
  if (!plan) return 'Chưa có phương án.'
  return `${plan.total_units} xe · ${plan.move_count} chặng · ${plan.total_cost.toLocaleString('vi-VN')} VNĐ`
}

