// Preflight cấu hình gateway LLM — nguồn: `GET /api/v1/llm/health` của AI service, proxy qua
// NestJS tại `/operator/ai/llm/health`.
//
// Endpoint **không bao giờ** trả khóa API, chỉ trả cờ `apiKeyConfigured` (CLAUDE.md §8 #9).
// Đây là câu trả lời cho "lượt chạy **tới** sẽ đi đường nào", khác với `routing_mode` của một
// run đã chạy — cái đó là sự thật của riêng run đó và không được suy ngược ra cấu hình.

export type LlmModelHealth = {
  ok: boolean
  model: string
  servedBy?: string
  error?: string
}

export type LlmHealth = {
  isRoutingEnabled: boolean
  baseUrl: string
  isApiKeyConfigured: boolean
  analysis: LlmModelHealth
  explanation: LlmModelHealth
}

export type AgentModeReadiness = 'llm' | 'deterministic_by_config' | 'deterministic_no_key' | 'llm_degraded'

/**
 * Đường mà lượt chạy tới sẽ đi. Bám đúng điều kiện của đồ thị
 * (`graph.py`: `llm_enabled and client.configured`), cộng thêm một mức "bật nhưng model lỗi".
 */
export function agentModeReadiness(health: LlmHealth | undefined): AgentModeReadiness | undefined {
  if (!health) return undefined
  if (!health.isRoutingEnabled) return 'deterministic_by_config'
  if (!health.isApiKeyConfigured) return 'deterministic_no_key'
  if (!health.analysis.ok || !health.explanation.ok) return 'llm_degraded'
  return 'llm'
}

export const agentModeLabel: Record<AgentModeReadiness, string> = {
  llm: 'Agent tự chọn tool',
  llm_degraded: 'Bật LLM nhưng gateway lỗi',
  deterministic_by_config: 'Đường cố định',
  deterministic_no_key: 'Đường cố định — thiếu khoá',
}

export const agentModeDetail: Record<AgentModeReadiness, string> = {
  llm: 'Ba agent tự chọn tool trong allowlist của mình. Mọi con số vẫn do code deterministic tính.',
  llm_degraded: 'LLM_ROUTING_ENABLED=true nhưng gateway không trả lời; lượt chạy sẽ rơi về đường deterministic.',
  deterministic_by_config: 'LLM_ROUTING_ENABLED=false — mỗi agent chạy đúng chuỗi tool cố định, kết quả tái lập được.',
  deterministic_no_key: 'Đã bật định tuyến LLM nhưng chưa có LLM_API_KEY trong apps/ai/.env; đồ thị dùng đường cố định.',
}
