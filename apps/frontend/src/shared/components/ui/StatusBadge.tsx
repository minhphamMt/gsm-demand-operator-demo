import { Badge, type BadgeTone } from '@/shared/components/ui/Badge'

const statusTone: Record<string, BadgeTone> = {
  Draft: 'neutral', Generated: 'info', UnderReview: 'warning', Revised: 'warning', Stale: 'danger', Approved: 'success', Rejected: 'danger', FailedGeneration: 'danger', Active: 'info', Running: 'info', TargetReached: 'success', BudgetExhausted: 'warning',
  Completed: 'success', Cancelled: 'neutral', Expired: 'warning', Failed: 'danger', Open: 'info', Accepted: 'success', Declined: 'neutral', 'En route': 'info', Closed: 'neutral',
}

const statusLabel: Record<string, string> = {
  Draft: 'Bản nháp', Generated: 'Mới tạo', UnderReview: 'Chờ kiểm duyệt', Revised: 'Đã chỉnh sửa', Stale: 'Dữ liệu cũ', Approved: 'Đã duyệt', Rejected: 'Đã từ chối', FailedGeneration: 'Sinh phương án thất bại', Active: 'Đang chạy', Running: 'Đang chạy', TargetReached: 'Đạt mục tiêu', BudgetExhausted: 'Hết ngân sách',
  Completed: 'Hoàn thành', Cancelled: 'Đã hủy', Expired: 'Hết hạn', Failed: 'Thất bại', Closed: 'Đã đóng', Open: 'Đang chờ', Accepted: 'Đã nhận', Declined: 'Đã từ chối', 'En route': 'Đang di chuyển',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? 'neutral'}>{statusLabel[status] ?? status}</Badge>
}
