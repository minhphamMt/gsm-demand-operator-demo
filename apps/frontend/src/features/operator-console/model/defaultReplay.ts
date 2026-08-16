// Three consecutive rain-peak buckets verified against every 5/10/15-minute
// model: each bucket produces a policy-valid relocation, while only 10-11 of 30
// zones are raining. Cycling this window keeps the demo live without letting a
// forecast cross the 09:00 peak boundary and manufacture an abrupt demand drop.
export const verifiedReplaySources = [
  '2026-09-25T08:30:00+07:00',
  '2026-09-25T08:35:00+07:00',
  '2026-09-25T08:40:00+07:00',
] as const

const replayBucketMs = 5 * 60_000

/**
 * The model replay uses a frozen, checksummed dataset. Keep the live five-minute
 * cadence, but project it onto a verified rain/peak operating window. Mapping the
 * wall clock directly to the frozen data made evening demos silently select a
 * low-demand regime and manufacture empty proposals.
 */
export function currentOperatorReplaySourceAt(now = new Date()): string {
  const timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) {
    throw new Error('Không thể xác định giờ vận hành hiện tại.')
  }
  const bucket = Math.floor(timestamp / replayBucketMs)
  const index = ((bucket % verifiedReplaySources.length) + verifiedReplaySources.length) % verifiedReplaySources.length
  return verifiedReplaySources[index]!
}
