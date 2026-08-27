// Nhãn giờ ngắn cho trục thời gian của panel. Cố định múi giờ +07:00 theo CLAUDE.md §5.2.

export function formatTimeLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(parsed)
}
