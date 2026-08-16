// Cửa sổ rain_peak đã được kiểm trên bundle model hiện hành: cả 12 bucket đều có ít nhất
// một phương án điều chuyển trong bán kính vận hành. Phút vẫn bám đồng hồ thật để snapshot
// tự tiến mỗi 5 phút; đây không phải một snapshot cố định.
const replayDatasetDay = '2026-09-25'
const replayOperationalHour = 8

/**
 * The model replay uses a frozen, checksummed dataset. Keep the live five-minute
 * cadence, but project it onto a verified rain/peak operating window. Mapping the
 * wall clock directly to the frozen data made evening demos silently select a
 * low-demand regime and manufacture empty proposals.
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
  return `${replayDatasetDay}T${String(replayOperationalHour).padStart(2, '0')}:${String(completedBucketMinute).padStart(2, '0')}:00+07:00`
}
