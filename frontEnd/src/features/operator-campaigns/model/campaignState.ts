import type { Campaign } from '@/features/operator-data'

export type CampaignNotice = { message: string; tone: 'neutral' | 'success' | 'warning' }

export const activeCampaignStatuses = new Set<Campaign['status']>(['Active', 'Running'])

export function isCampaignCancellable(campaign: Campaign, now = new Date()) {
  return activeCampaignStatuses.has(campaign.status)
    && new Date(campaign.expiresAt) > now
    && (campaign.budgetLimit <= 0 || campaign.incentiveBudget < campaign.budgetLimit)
}

export function campaignNotice(campaign: Campaign, now = new Date()): CampaignNotice | undefined {
  if (campaign.status === 'Cancelled') {
    return { message: `${campaign.expired} offer mở đã hết hạn và ${campaign.cancelled} tài xế đã được giải phóng khỏi campaign.`, tone: 'neutral' }
  }
  if (campaign.status === 'TargetReached') {
    return { message: `Campaign đã đủ ${campaign.suggestedActivation} lượt chấp nhận; hệ thống đã dừng các offer còn mở.`, tone: 'success' }
  }
  if (campaign.status === 'BudgetExhausted' || (campaign.budgetLimit > 0 && campaign.incentiveBudget >= campaign.budgetLimit)) {
    return { message: 'Ngân sách campaign đã sử dụng hết; không phát hành thêm offer.', tone: 'warning' }
  }
  if (activeCampaignStatuses.has(campaign.status) && new Date(campaign.expiresAt) <= now) {
    return { message: 'Campaign đã hết thời gian vận hành và đang chờ lifecycle job đóng trạng thái.', tone: 'warning' }
  }
  if (campaign.candidateCount === 0) {
    return { message: 'Không có tài xế phù hợp; campaign vẫn được ghi nhận để điều hành viên theo dõi.', tone: 'warning' }
  }
  return undefined
}
