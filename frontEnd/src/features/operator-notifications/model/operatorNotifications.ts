import type { Campaign, Offer, Proposal } from '@/features/operator-data'
import { routes } from '@/shared/config/routes'

export type OperatorNotification = { id: string; message: string; path: string; tone: 'amber' | 'emerald' | 'rose' | 'sky' }

type NotificationPlan = Pick<Proposal, 'id' | 'status' | 'title'>
type NotificationCampaign = Pick<Campaign, 'accepted' | 'budgetLimit' | 'candidateCount' | 'expiresAt' | 'id' | 'incentiveBudget' | 'status' | 'suggestedActivation'>
type NotificationOffer = Pick<Offer, 'id' | 'status'>

export function buildOperatorNotifications(plans: readonly NotificationPlan[], campaigns: readonly NotificationCampaign[], offers: readonly NotificationOffer[], now = new Date()): OperatorNotification[] {
  const reviewNotifications = plans
    .filter((plan) => plan.status === 'UnderReview' || plan.status === 'Revised')
    .map((plan) => ({ id: `plan-${plan.id}`, message: `${plan.title.split('—')[0]?.trim()} đang chờ kiểm duyệt.`, path: routes.operator.planDetail(plan.id), tone: 'amber' as const }))

  const campaignNotifications = campaigns.flatMap((campaign) => {
    const path = routes.operator.campaigns
    if (campaign.status === 'TargetReached') return [{ id: `campaign-${campaign.id}-target`, message: `${campaign.id} đã đạt mục tiêu huy động.`, path, tone: 'emerald' as const }]
    if (campaign.status === 'BudgetExhausted') return [{ id: `campaign-${campaign.id}-budget-exhausted`, message: `${campaign.id} đã hết ngân sách.`, path, tone: 'rose' as const }]
    if (campaign.status === 'Expired') return [{ id: `campaign-${campaign.id}-expired`, message: `${campaign.id} đã hết thời gian vận hành.`, path, tone: 'rose' as const }]
    if (campaign.status !== 'Active' && campaign.status !== 'Running') return []

    const items: OperatorNotification[] = []
    if (campaign.candidateCount === 0) items.push({ id: `campaign-${campaign.id}-no-candidates`, message: `${campaign.id} không còn tài xế đủ điều kiện.`, path, tone: 'rose' })
    if (campaign.budgetLimit > 0 && campaign.incentiveBudget / campaign.budgetLimit >= 0.8) items.push({ id: `campaign-${campaign.id}-budget-80`, message: `${campaign.id} đã sử dụng từ 80% ngân sách.`, path, tone: 'amber' })
    const remainingMs = new Date(campaign.expiresAt).getTime() - now.getTime()
    if (remainingMs > 0 && remainingMs <= 5 * 60_000) items.push({ id: `campaign-${campaign.id}-expiring`, message: `${campaign.id} sẽ hết hạn trong 5 phút.`, path, tone: 'amber' })
    items.push({ id: `campaign-${campaign.id}-accepted-${campaign.accepted}`, message: `${campaign.id} đã có ${campaign.accepted}/${campaign.suggestedActivation} tài xế chấp nhận offer.`, path, tone: 'sky' })
    return items
  })

  const expiredOfferCount = offers.filter((offer) => offer.status === 'Expired').length
  const offerNotifications: OperatorNotification[] = expiredOfferCount
    ? [{ id: `offers-expired-${expiredOfferCount}`, message: `${expiredOfferCount} offer đã hết hạn và cần được theo dõi.`, path: routes.operator.campaigns, tone: 'amber' }]
    : []

  return [...reviewNotifications, ...campaignNotifications, ...offerNotifications]
}
