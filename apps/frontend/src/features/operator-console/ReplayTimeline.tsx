import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ReplayTimelineStep } from '@/features/operator-data'

type ReplayTimelineProps = {
  displayTimeForSource?: (sourceAt: string) => string
  hasError?: boolean
  isLoading: boolean
  onSourceChange: (sourceAt: string) => void
  selectedSourceAt: string
  steps: readonly ReplayTimelineStep[]
}

export function ReplayTimeline({ displayTimeForSource = (sourceAt) => sourceAt, hasError = false, isLoading, onSourceChange, selectedSourceAt, steps }: ReplayTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const onSourceChangeRef = useRef(onSourceChange)
  onSourceChangeRef.current = onSourceChange
  const matchedIndex = steps.findIndex((step) => step.sourceAt === selectedSourceAt)
  // A live snapshot can briefly be rendered before its replay source is known.
  // Treat that state as the latest bucket instead of silently jumping to bucket 2.
  const selectedIndex = matchedIndex >= 0 ? matchedIndex : steps.length - 1
  const maxRain = Math.max(0.01, ...steps.map((step) => step.meanRainMmH))

  useEffect(() => {
    if (!isPlaying || isLoading) return undefined
    if (selectedIndex >= steps.length - 1) { setIsPlaying(false); return undefined }
    const timeout = window.setTimeout(() => onSourceChangeRef.current(steps[selectedIndex + 1]!.sourceAt), 1500)
    return () => window.clearTimeout(timeout)
  }, [isLoading, isPlaying, selectedIndex, steps])

  useEffect(() => {
    if (hasError) setIsPlaying(false)
  }, [hasError])

  const select = (index: number) => {
    const next = steps[index]
    if (!next || isLoading) return
    setIsPlaying(false)
    onSourceChange(next.sourceAt)
  }

  const togglePlay = () => {
    if (isPlaying) { setIsPlaying(false); return }
    if (!steps.length) return
    if (selectedIndex >= steps.length - 1 && steps[0]) onSourceChange(steps[0].sourceAt)
    setIsPlaying(true)
  }

  return <div className="nf-timeline" aria-label="Thanh replay vận hành" aria-busy={isLoading}>
    <div className="nf-timeline-buttons">
      <button aria-label="Lùi 5 phút" disabled={isLoading || selectedIndex === 0} onClick={() => select(selectedIndex - 1)} type="button"><ChevronLeft size={15} /></button>
      <button aria-label={isPlaying ? 'Tạm dừng replay' : 'Phát replay'} className="is-active" disabled={!steps.length} onClick={togglePlay} type="button">{isLoading ? <LoaderCircle className="animate-spin" size={14} /> : isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
      <button aria-label="Tiến 5 phút" disabled={isLoading || selectedIndex >= steps.length - 1} onClick={() => select(selectedIndex + 1)} type="button"><ChevronRight size={15} /></button>
    </div>
    <div className="nf-timeline-track">
      <div>{steps.map((step, index) => <button
        aria-label={`${formatTime(displayTimeForSource(step.sourceAt))} · mưa trung bình ${step.meanRainMmH.toFixed(2)} mm/h`}
        aria-pressed={index === selectedIndex}
        className={index === selectedIndex ? 'is-current' : index < selectedIndex ? 'is-past' : ''}
        disabled={isLoading}
        key={step.sourceAt}
        onClick={() => select(index)}
        style={{ height: 10 + step.meanRainMmH / maxRain * 20 }}
        title={`${formatTime(displayTimeForSource(step.sourceAt))} · ${step.meanRainMmH.toFixed(2)} mm/h`}
        type="button"
      />)}</div>
      <p><span>{steps[0] ? formatTime(displayTimeForSource(steps[0].sourceAt)) : '—'}</span><span>{formatTime(displayTimeForSource(selectedSourceAt))}</span><span>{steps.at(-1) ? formatTime(displayTimeForSource(steps.at(-1)!.sourceAt)) : '—'}</span></p>
    </div>
    <em>REPLAY · DỮ LIỆU GHI NHẬN 5′/BƯỚC<br /><b>{isLoading ? 'Đang đọc dữ liệu…' : hasError ? 'Đã dừng do lỗi' : isPlaying ? 'Tự chạy · 1,5 giây/bước' : `Đang xem ${formatTime(displayTimeForSource(selectedSourceAt))}`}</b></em>
  </div>
}

function formatTime(sourceAt: string) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(sourceAt))
}
