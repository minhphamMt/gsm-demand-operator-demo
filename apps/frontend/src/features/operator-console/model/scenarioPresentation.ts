const normalLabel = { heading: 'BÌNH THƯỜNG', weather: 'Bình thường' } as const
const regimeLabels: Readonly<Record<string, { heading: string; weather: string }>> = {
  normal: normalLabel,
  peak: { heading: 'GIỜ CAO ĐIỂM', weather: 'Giờ cao điểm' },
  rain: { heading: 'MƯA', weather: 'Mưa' },
  rain_peak: { heading: 'MƯA GIỜ CAO ĐIỂM', weather: 'Mưa lớn · giờ cao điểm' },
}

export function scenarioPresentation(regime: string, sourceAt: string) {
  const label = regimeLabels[regime] ?? normalLabel
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(new Date(sourceAt))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '--'
  const sourceLabel = `${value('day')}/${value('month')} ${value('hour')}:${value('minute')}`

  return {
    heading: `KỊCH BẢN · ${label.heading} ${sourceLabel}`,
    weather: label.weather,
  }
}
