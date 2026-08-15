const replayDatasetDay = '2026-09-30'

/**
 * The model replay uses a frozen, checksummed dataset, so its calendar date must
 * stay inside that dataset. The clock follows the current Hanoi server time and
 * is rounded down to the latest complete five-minute bucket.
 */
export function currentOperatorReplaySourceAt(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('Không thể xác định giờ vận hành hiện tại.')
  }
  const completedBucketMinute = Math.floor(minute / 5) * 5
  return `${replayDatasetDay}T${String(hour).padStart(2, '0')}:${String(completedBucketMinute).padStart(2, '0')}:00+07:00`
}
