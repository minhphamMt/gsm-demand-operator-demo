const replayBucketMs = 5 * 60_000

/**
 * Replay data can arrive as either a UTC ISO string or the original +07:00
 * source timestamp. Compare instants, never their serialized text.
 */
export function isSameReplayInstant(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs
}

export function floorToReplayBucket(value: Date) {
  return new Date(Math.floor(value.getTime() / replayBucketMs) * replayBucketMs)
}

export function observedAtForReplaySource(
  sourceAt: string,
  anchorSourceAt: string,
  serverNow: string,
) {
  const sourceMs = Date.parse(sourceAt)
  const anchorMs = Date.parse(anchorSourceAt)
  const serverMs = Date.parse(serverNow)
  if (![sourceMs, anchorMs, serverMs].every(Number.isFinite)) return sourceAt
  const liveBucketMs = floorToReplayBucket(new Date(serverMs)).getTime()
  return new Date(liveBucketMs + sourceMs - anchorMs).toISOString()
}
