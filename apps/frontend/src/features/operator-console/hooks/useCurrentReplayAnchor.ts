import { useEffect, useState } from 'react'

import { currentOperatorReplaySourceAt } from '@/features/operator-console/model/defaultReplay'

const replayBucketMs = 5 * 60_000
const boundarySafetyDelayMs = 100

export function useCurrentReplayAnchor(serverTime: string | undefined, isServerUnavailable: boolean) {
  const [replayAnchorAt, setReplayAnchorAt] = useState<string>()

  useEffect(() => {
    if (!serverTime && !isServerUnavailable) return

    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN
    const initialClientTime = Date.now()
    const initialServerTime = Number.isFinite(parsedServerTime) ? parsedServerTime : initialClientTime
    const serverOffsetMs = initialServerTime - initialClientTime
    let nextBoundaryTimer: number | undefined

    const synchronize = () => {
      if (nextBoundaryTimer !== undefined) window.clearTimeout(nextBoundaryTimer)
      const estimatedServerNow = new Date(Date.now() + serverOffsetMs)
      const nextAnchor = currentOperatorReplaySourceAt(estimatedServerNow)
      setReplayAnchorAt((currentAnchor) => currentAnchor === nextAnchor ? currentAnchor : nextAnchor)

      const elapsedInBucketMs = estimatedServerNow.getTime() % replayBucketMs
      nextBoundaryTimer = window.setTimeout(
        synchronize,
        replayBucketMs - elapsedInBucketMs + boundarySafetyDelayMs,
      )
    }
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize()
    }

    synchronize()
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    return () => {
      if (nextBoundaryTimer !== undefined) window.clearTimeout(nextBoundaryTimer)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
    }
  }, [isServerUnavailable, serverTime])

  return replayAnchorAt
}
