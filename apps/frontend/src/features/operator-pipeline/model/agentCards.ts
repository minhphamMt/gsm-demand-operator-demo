// Lưới thẻ agent của tab Agents (agent/07-Design §4).
//
// Design vẽ 8 thẻ (có Weather Agent, Fee Agent) nhưng đồ thị thật chỉ có 4 agent:
// situation_assessment (3 capability con forecast/traffic/supply), dispatch, optimization,
// explanation. Ở đây trải 3 capability thành 3 thẻ riêng và giữ situation_assessment làm thẻ
// tổng → 7 thẻ, **tất cả đều có nguồn dữ liệu thật**. Không dựng thẻ cho agent không tồn tại.

import type { AgentStatus, PipelineAgent, PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { agentDurationSeconds, planSummary } from '@/features/operator-pipeline/model/pipelineRun'

export type AgentCardKind = 'capability' | 'agent' | 'aggregate'

export type AgentCard = {
  id: string
  label: string
  role: string
  kind: AgentCardKind
  status: AgentStatus
  message: string
  metrics: readonly { label: string; value: string }[]
  dependsOn: readonly string[]
  // Thời lượng chạy (giây) từ `started_at`/`finished_at` — 02-technical-spec §2.5.
  durationSeconds: number | null
}

const capabilityRole: Record<string, string> = {
  forecast: 'Dự báo cung–cầu p10/p50/p90',
  traffic: 'Ảnh hưởng mưa lên thời gian di chuyển',
  supply: 'Nguồn xe rút được an toàn',
}

export function buildAgentCards(run: PipelineRunRecord | undefined): readonly AgentCard[] {
  const agents = run?.agents ?? {}
  const situation = agents.situation_assessment
  const capabilities = situation?.capabilities ?? {}

  return [
    ...(['forecast', 'traffic', 'supply'] as const).map((key) => ({
      id: key,
      label: capitalize(key),
      role: capabilityRole[key] ?? '',
      kind: 'capability' as const,
      status: capabilities[key]?.status ?? fallbackStatus(situation),
      message: capabilities[key]?.message ?? '',
      metrics: [],
      dependsOn: [],
      // Capability không có mốc riêng; thời lượng thuộc về agent cha.
      durationSeconds: null,
    })),
    {
      id: 'situation_assessment',
      label: 'Situation Assessment',
      role: 'Gộp ba capability thành bức tranh tình huống',
      kind: 'aggregate' as const,
      status: situation?.status ?? 'PENDING',
      message: situation?.message ?? '',
      metrics: countMetrics(run),
      dependsOn: ['forecast', 'traffic', 'supply'],
      durationSeconds: agentDurationSeconds(situation),
    },
    {
      id: 'dispatch',
      label: 'Dispatch',
      role: 'Chọn zone đích và dựng chặng điều chuyển',
      kind: 'agent' as const,
      status: agents.dispatch?.status ?? 'PENDING',
      message: agents.dispatch?.message ?? '',
      metrics: dispatchMetrics(run),
      dependsOn: ['situation_assessment'],
      durationSeconds: agentDurationSeconds(agents.dispatch),
    },
    {
      id: 'optimization',
      label: 'Optimization',
      role: 'Giải bài toán vận tải, so ba chiến lược',
      kind: 'agent' as const,
      status: agents.optimization?.status ?? 'PENDING',
      message: agents.optimization?.message ?? '',
      metrics: optimizationMetrics(run),
      dependsOn: ['dispatch'],
      durationSeconds: agentDurationSeconds(agents.optimization),
    },
    {
      id: 'explanation',
      label: 'Explanation',
      role: 'Viết diễn giải cho người duyệt',
      kind: 'agent' as const,
      status: agents.explanation?.status ?? 'PENDING',
      message: agents.explanation?.message ?? '',
      metrics: explanationMetrics(run),
      dependsOn: ['optimization'],
      durationSeconds: agentDurationSeconds(agents.explanation),
    },
  ]
}

export function runningAgentCount(cards: readonly AgentCard[]): number {
  return cards.filter((card) => card.status === 'RUNNING').length
}

// Capability chưa được báo cáo thì bám trạng thái của agent cha: agent đang chạy nghĩa là
// capability của nó đang chờ tới lượt, không phải đã xong.
function fallbackStatus(situation: PipelineAgent | undefined): AgentStatus {
  if (!situation) return 'PENDING'
  return situation.status === 'DONE' ? 'DONE' : 'PENDING'
}

function countMetrics(run: PipelineRunRecord | undefined): readonly { label: string; value: string }[] {
  const toolCalls = run?.tool_calls ?? []
  if (toolCalls.length === 0) return []
  return [{ label: 'Tool đã gọi', value: String(toolCalls.length) }]
}

function dispatchMetrics(run: PipelineRunRecord | undefined) {
  const plan = recommendedPlan(run)
  if (!plan) return []
  return [
    { label: 'Chặng', value: String(plan.move_count) },
    { label: 'Xe điều', value: `${plan.total_units}` },
  ]
}

function optimizationMetrics(run: PipelineRunRecord | undefined) {
  const plan = recommendedPlan(run)
  if (!plan) return []
  return [
    { label: 'Chiến lược', value: String(run?.plan_set?.distinct_plan_count ?? 0) },
    { label: 'Zone còn thiếu', value: String(plan.residual_zone_count) },
  ]
}

function explanationMetrics(run: PipelineRunRecord | undefined) {
  if (!run?.explanation) return []
  return [{ label: 'Nguồn văn bản', value: run.explanation.layer === 'llm' ? 'LLM' : 'Template' }]
}

function recommendedPlan(run: PipelineRunRecord | undefined) {
  const plans = run?.plan_set?.plans ?? []
  return plans.find((plan) => plan.plan_id === run?.recommended_plan_id) ?? plans[0]
}

export function recommendedPlanSummary(run: PipelineRunRecord | undefined): string {
  return planSummary(run?.plan_set, run?.recommended_plan_id)
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
