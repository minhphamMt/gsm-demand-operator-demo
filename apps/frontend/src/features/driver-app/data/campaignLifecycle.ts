import type { CampaignDriverView } from './types'

export function isCampaignActionable(
  campaign: Pick<CampaignDriverView, 'end_at' | 'reward_cutoff_at' | 'start_at' | 'status'> | null,
  now = Date.now(),
) {
  if (!campaign || campaign.status !== 'ACTIVE') return false
  const startAt = timestamp(campaign.start_at)
  const endAt = timestamp(campaign.end_at)
  const rewardCutoffAt = timestamp(campaign.reward_cutoff_at)
  if (campaign.start_at && (startAt === null || startAt > now)) return false
  if (campaign.end_at && (endAt === null || endAt <= now)) return false
  if (campaign.reward_cutoff_at && (rewardCutoffAt === null || rewardCutoffAt <= now)) return false
  return true
}

export function campaignLifecycleBoundaries(campaign: Pick<CampaignDriverView, 'end_at' | 'reward_cutoff_at' | 'start_at'>) {
  return [campaign.start_at, campaign.end_at, campaign.reward_cutoff_at]
    .map(timestamp)
    .filter((value): value is number => value !== null)
}

function timestamp(value: string | null) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}
