import type { AuditAction } from '@/features/operator-data/model/types'

export const auditActionLabels: Record<AuditAction, string> = {
  ActivationStarted: 'Phát hành offer',
  Approved: 'Phê duyệt proposal',
  CampaignCancelled: 'Dừng chiến dịch',
  CampaignTargetReached: 'Campaign đạt mục tiêu',
  Created: 'Tạo bản ghi',
  DemoReset: 'Khởi tạo dữ liệu',
  OfferAccepted: 'Tài xế nhận offer',
  OfferDeclined: 'Tài xế từ chối offer',
  OfferExpired: 'Offer hết hạn',
  Rejected: 'Từ chối proposal',
  Revised: 'Chỉnh sửa proposal',
  ScenarioLoaded: 'Đồng bộ snapshot',
}
