import type { AgentState, FlowStage, PlanCost, ZoneStatus } from './types'

export const zoneStatusLabels: Record<ZoneStatus, string> = {
  BALANCED: 'Cân bằng',
  WATCH: 'Theo dõi',
  ABNORMAL: 'Bất thường',
  SHORTAGE: 'Thiếu xe',
}

export const agentStateLabels: Record<AgentState, string> = {
  PENDING: 'Đang chờ',
  RUNNING: 'Đang chạy',
  DONE: 'Hoàn tất',
  WARNING: 'Cảnh báo',
  FAILED: 'Lỗi',
}

export const flowStageLabels: Record<FlowStage, string> = {
  NORMAL: 'Mạng lưới ổn định',
  DEMAND_WARNING: 'Cảnh báo nhu cầu',
  FORECAST: 'Đang dự báo',
  ANALYZING: 'Các tác tử đang phân tích',
  PLAN_READY: 'Đã có phương án',
  PLAN_REVIEW: 'Chờ phê duyệt',
  DISPATCHING: 'Đang điều phối',
  EXECUTING: 'Đang thực thi',
  NEW_DATA: 'Đã nhận dữ liệu mới',
  REPLAN_READY: 'Có đề xuất cập nhật',
  UPDATE_APPROVED: 'Đã duyệt cập nhật',
}

export const planCostLabels: Record<PlanCost, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Vừa',
  HIGH: 'Cao',
}

export const statusSeverityLabels = {
  WATCH: 'THEO DÕI',
  HIGH: 'CAO',
  CRITICAL: 'NGHIÊM TRỌNG',
} as const

export const rejectReasonLabels = {
  'Cost too high': 'Chi phí quá cao',
  'Too many vehicles moved': 'Điều chuyển quá nhiều xe',
  'ETA benefit too low': 'Cải thiện ETA chưa đủ',
  'Operational concern': 'Lo ngại vận hành',
  Other: 'Lý do khác',
} as const

export function formatZoneStatus(status: ZoneStatus) {
  return zoneStatusLabels[status]
}
