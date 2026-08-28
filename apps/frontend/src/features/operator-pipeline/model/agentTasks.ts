// Ghép task quy trình với dấu vết tool để mỗi node trong tab Sơ đồ luồng nói được
// "agent này phụ trách những việc gì, đã gọi tool nào".
//
// Task đến từ bảng chỉ huy (`operator-console/model/systemSteps.ts`) qua props — feature này
// không tự dựng lại logic quy trình, và cũng không import trực tiếp feature kia.

import type { PipelineToolCall, RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

export type AgentTaskState = 'done' | 'running' | 'waiting' | 'queued' | 'attention' | 'stale' | 'skipped' | 'idle'

export type AgentTask = {
  id: string
  label: string
  command: string
  result: string
  state: AgentTaskState
  owner: string
}

/** Task của một agent, cộng thêm mỗi lần agent đó gọi tool trong lượt chạy hiện tại. */
export function tasksForAgent(
  agentId: string,
  tasks: readonly AgentTask[],
  toolCalls: readonly PipelineToolCall[],
): readonly AgentTask[] {
  const owned = tasks.filter((task) => task.owner === agentId)
  const calls = toolCalls
    .map((call, index) => ({ call, index }))
    .filter(({ call }) => attributedAgent(call) === agentId)
    .map(({ call, index }): AgentTask => ({
      id: `tool-${index}`,
      label: `Tool: ${call.tool}`,
      command: `${call.agent}.${call.tool}()`,
      result: call.detail || (call.ok ? 'Trả kết quả hợp lệ' : 'Tool báo lỗi; agent rơi về đường deterministic'),
      state: call.ok ? 'done' : 'attention',
      owner: agentId,
    }))
  return [...owned, ...calls]
}

// Ba capability con được báo cáo dưới tên agent cha `situation_assessment`, nên tool của chúng
// phải được chia lại theo tên tool — nếu không, cùng một tool sẽ hiện ba lần dưới ba thẻ.
// Tool không đoán được thuộc capability nào thì ở lại thẻ tổng, không gán bừa.
const capabilityKeywords: readonly { agentId: string; keywords: readonly string[] }[] = [
  { agentId: 'forecast', keywords: ['forecast', 'predict'] },
  { agentId: 'traffic', keywords: ['traffic', 'rain', 'weather'] },
  { agentId: 'supply', keywords: ['supply', 'hotspot', 'imbalance'] },
]

function attributedAgent(call: PipelineToolCall): string {
  if (call.agent !== 'situation_assessment') return call.agent
  const tool = call.tool.toLowerCase()
  return capabilityKeywords.find((entry) => entry.keywords.some((keyword) => tool.includes(keyword)))?.agentId
    ?? 'situation_assessment'
}

// Nhãn hiển thị trên nhật ký. Suy ra **ở client** từ `actor` + `tool`, dùng lại đúng phép
// quy thuộc của sơ đồ luồng — nếu không, cùng một lượt gọi tool sẽ mang hai cái tên ở hai
// chỗ trên cùng màn hình.
//
// Trên dây vẫn là tên agent thật: `situation_assessment` không tồn tại ba bản sao ở backend,
// và không được bịa ra thẻ agent nào không có trong đồ thị.
const actorDisplayName: Record<string, string> = {
  forecast: 'FORECAST_AGENT',
  traffic: 'TRAFFIC_AGENT',
  supply: 'SUPPLY_AGENT',
  situation_assessment: 'SITUATION_AGENT',
  dispatch: 'DISPATCH_AGENT',
  optimization: 'OPTIMIZATION_AGENT',
  explanation: 'EXPLANATION_AGENT',
  graph: 'GRAPH',
}

export function eventActorLabel(event: Pick<RunEvent, 'actor' | 'tool'>): string {
  const attributed = attributedAgent({ agent: event.actor, tool: event.tool ?? '', ok: true, detail: '' })
  return actorDisplayName[attributed] ?? attributed.toUpperCase()
}

export function outsideTasks(tasks: readonly AgentTask[]): readonly AgentTask[] {
  return tasks.filter((task) => task.owner === 'outside')
}
