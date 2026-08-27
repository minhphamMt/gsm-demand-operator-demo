// Nhãn và màu của trạng thái agent. Tách khỏi component để mỗi file chỉ export một thứ,
// và để nhãn dùng chung giữa lưới thẻ (tab Agents) và sơ đồ (tab Connect).

import type { AgentStatus } from '@/features/operator-pipeline/model/pipelineRun'

const statusLabel: Record<AgentStatus, string> = {
  PENDING: 'Chờ',
  RUNNING: 'Đang chạy',
  DONE: 'Xong',
  WARNING: 'Cảnh báo',
  FAILED: 'Lỗi',
}

const statusColor: Record<AgentStatus, string> = {
  PENDING: 'text-[var(--nfp-idle)]',
  RUNNING: 'text-[var(--nfp-accent)]',
  DONE: 'text-[var(--nfp-ok)]',
  WARNING: 'text-[var(--nfp-warn)]',
  FAILED: 'text-[var(--nfp-crit)]',
}

export function agentStatusLabel(status: AgentStatus): string {
  return statusLabel[status]
}

export function agentStatusColor(status: AgentStatus): string {
  return statusColor[status]
}
