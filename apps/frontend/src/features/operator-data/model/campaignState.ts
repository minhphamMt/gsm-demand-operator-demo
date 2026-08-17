import type { Campaign } from '@/features/operator-data/model/types'

const operationalCampaignStatuses = new Set<Campaign['status']>(['Active', 'Running'])

export function isCampaignOperational(campaign: Pick<Campaign, 'status'>) {
  return operationalCampaignStatuses.has(campaign.status)
}

export function isCampaignOverdue(campaign: Pick<Campaign, 'status' | 'expiresAt'>, now = Date.now()) {
  const expiresAt = Date.parse(campaign.expiresAt)
  return isCampaignOperational(campaign) && Number.isFinite(expiresAt) && now > expiresAt
}
