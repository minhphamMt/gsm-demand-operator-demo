import type { Campaign } from '@/features/operator-data/model/types'

const operationalCampaignStatuses = new Set<Campaign['status']>(['Active', 'Running'])

export function isCampaignOperational(campaign: Pick<Campaign, 'status'>) {
  return operationalCampaignStatuses.has(campaign.status)
}
