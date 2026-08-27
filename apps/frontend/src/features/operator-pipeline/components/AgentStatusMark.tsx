import { Check, Circle, LoaderCircle, TriangleAlert, X } from 'lucide-react'

import { agentStatusColor } from '@/features/operator-pipeline/model/agentStatus'
import type { AgentStatus } from '@/features/operator-pipeline/model/pipelineRun'

// Trạng thái không bao giờ chỉ mã hoá bằng màu: mỗi trạng thái có icon riêng, và nơi gọi
// luôn kèm nhãn chữ (quy tắc a11y của .agents/frontend-engineering).

export function AgentStatusMark({ status }: { status: AgentStatus }) {
  const className = `size-4 ${agentStatusColor(status)}`
  if (status === 'RUNNING') return <LoaderCircle aria-hidden className={`${className} animate-spin`} />
  if (status === 'DONE') return <Check aria-hidden className={className} />
  if (status === 'WARNING') return <TriangleAlert aria-hidden className={className} />
  if (status === 'FAILED') return <X aria-hidden className={className} />
  return <Circle aria-hidden className={className} />
}
