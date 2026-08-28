// Guard kiểu cho dữ liệu run trả về từ /operator/ai/runs.
// Cố ý nới tay một phần (agent message/capabilities) để một run FAILED vẫn hiển thị được
// mà không bị guard bỏ cả cây — trạng thái FAILED là dữ liệu hợp lệ, không phải payload lỗi.

import type { LlmHealth, LlmModelHealth } from '@/features/operator-pipeline/model/llmHealth'
import type { PipelineRunRecord, PipelineAgent, PipelinePlan, PipelinePlanSet, RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const hasString = (value: Record<string, unknown>, key: string) => typeof value[key] === 'string'
const hasNumber = (value: Record<string, unknown>, key: string) => typeof value[key] === 'number'
const hasBoolean = (value: Record<string, unknown>, key: string) => typeof value[key] === 'boolean'

const agentStatuses = ['PENDING', 'RUNNING', 'DONE', 'WARNING', 'FAILED'] as const
const isAgentStatus = (value: unknown): value is PipelineAgent['status'] => typeof value === 'string' && agentStatuses.some((status) => status === value)

const isCapability = (value: unknown): value is { status: PipelineAgent['status']; message: string } =>
  isRecord(value) && isAgentStatus(value.status) && typeof value.message === 'string'

// Mốc thời gian nới tay như phần còn lại của guard: thiếu thì UI không hiện thời lượng,
// không được vì thế mà bỏ cả cây agent.
const isOptionalTimestamp = (value: unknown) => value === undefined || value === null || typeof value === 'string'

const isAgent = (value: unknown): value is PipelineAgent =>
  isRecord(value) && isAgentStatus(value.status) && typeof value.message === 'string'
    && isOptionalTimestamp(value.started_at) && isOptionalTimestamp(value.finished_at)
    && (value.capabilities === undefined || (isRecord(value.capabilities) && Object.values(value.capabilities).every(isCapability)))

const isToolCall = (value: unknown): boolean => isRecord(value) && hasString(value, 'agent') && hasString(value, 'tool') && hasBoolean(value, 'ok')

// Nới tay hai tầng, có chủ ý:
// - Chỉ đòi năm field dựng nên một dòng đọc được. `tool`/`ok`/`code` thiếu thì dòng vẫn hiện,
//   chỉ không có badge.
// - `kind` và `source` không so với union đóng. Backend thêm loại sự kiện mới trước khi client
//   kịp cập nhật là chuyện bình thường; bỏ dòng lạ sẽ để lại lỗ hổng im lặng giữa nhật ký.
export const isRunEvent = (value: unknown): value is RunEvent =>
  isRecord(value) && hasNumber(value, 'seq') && hasString(value, 'at')
    && hasString(value, 'kind') && hasString(value, 'actor') && hasString(value, 'text')

const isPlan = (value: unknown): value is PipelinePlan =>
  isRecord(value) && hasString(value, 'plan_id') && hasString(value, 'strategy')
    && hasNumber(value, 'move_count') && hasNumber(value, 'total_units')
    && hasNumber(value, 'total_cost') && hasNumber(value, 'residual_zone_count')

const isPlanSet = (value: unknown): value is PipelinePlanSet =>
  isRecord(value) && Array.isArray(value.plans) && value.plans.every(isPlan)
    && hasBoolean(value, 'converged') && hasNumber(value, 'distinct_plan_count')

export const isPipelineRunRecord = (value: unknown): value is PipelineRunRecord => {
  if (!isRecord(value)) return false
  if (!hasString(value, 'run_id') || !hasString(value, 'status')) return false
  if (value.status !== 'RUNNING' && value.status !== 'DONE' && value.status !== 'FAILED') return false
  if (value.agents !== undefined && (!isRecord(value.agents) || !Object.values(value.agents).every(isAgent))) return false
  if (value.tool_calls !== undefined && !Array.isArray(value.tool_calls)) return false
  if (value.tool_calls !== undefined && !value.tool_calls.every(isToolCall)) return false
  if (value.plan_set !== undefined && !isPlanSet(value.plan_set)) return false
  if (value.warnings !== undefined && !Array.isArray(value.warnings)) return false
  // Chỉ đòi `events` là mảng. Dòng hỏng lẻ được lọc ở hook, không kéo cả bản ghi run xuống —
  // mất một dòng nhật ký thì tiếc, mất cả trạng thái run thì UI trắng.
  if (value.events !== undefined && !Array.isArray(value.events)) return false
  return true
}

// Guard cho `/operator/ai/llm/health`. Chuyển luôn snake_case của AI service sang camelCase
// để phần còn lại của frontend không phải biết hai lối đặt tên.
const isModelHealth = (value: unknown) => isRecord(value) && typeof value.ok === 'boolean' && hasString(value, 'model')

export function readLlmHealth(value: unknown): LlmHealth | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.llm_routing_enabled !== 'boolean' || typeof value.api_key_configured !== 'boolean') return undefined
  if (!isModelHealth(value.analysis) || !isModelHealth(value.explanation)) return undefined
  return {
    isRoutingEnabled: value.llm_routing_enabled,
    isApiKeyConfigured: value.api_key_configured,
    baseUrl: typeof value.base_url === 'string' ? value.base_url : '',
    analysis: readModelHealth(value.analysis),
    explanation: readModelHealth(value.explanation),
  }
}

function readModelHealth(value: unknown): LlmModelHealth {
  const source = isRecord(value) ? value : {}
  return {
    ok: source.ok === true,
    model: typeof source.model === 'string' ? source.model : '',
    ...(typeof source.served_by === 'string' ? { servedBy: source.served_by } : {}),
    ...(typeof source.error === 'string' ? { error: source.error } : {}),
  }
}
