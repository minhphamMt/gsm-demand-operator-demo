import { useEffect, useState } from 'react'

import { campaignLifecycleBoundaries } from './campaignLifecycle'
import type { CampaignDriverView } from './types'

const maximumTimeout = 2_147_000_000

export function useCampaignLifecycleNow(campaigns: readonly CampaignDriverView[]) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const nextBoundary = campaigns
      .flatMap(campaignLifecycleBoundaries)
      .filter((boundary) => boundary > now)
      .sort((left, right) => left - right)[0]
    if (nextBoundary === undefined) return undefined
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(maximumTimeout, nextBoundary - now + 20),
    )
    return () => window.clearTimeout(timeout)
  }, [campaigns, now])

  return now
}
