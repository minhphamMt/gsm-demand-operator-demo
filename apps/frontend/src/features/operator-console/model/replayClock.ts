const replayBucketMs = 5 * 60_000

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
