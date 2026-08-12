export function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMultiplier(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)}x`
}

export function formatPercentRatio(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'percent',
    maximumFractionDigits,
  }).format(value)
}

export function formatOptionalPercentRatio(value: number | null, maximumFractionDigits = 0) {
  return value === null ? 'Chưa có' : formatPercentRatio(value, maximumFractionDigits)
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}
