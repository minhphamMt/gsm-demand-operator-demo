import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ReplayTimelineStep } from '@/features/operator-data'

type ReplayTimelineProps = {
  isLoading: boolean
  onSourceChange: (sourceAt: string) => void
  selectedSourceAt: string
  steps: readonly ReplayTimelineStep[]
}

export function ReplayTimeline({ isLoading, onSourceChange, selectedSourceAt, steps }: ReplayTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const selectedIndex = Math.max(0, steps.findIndex((step) => step.sourceAt === selectedSourceAt))
  const maxRain = Math.max(0.01, ...steps.map((step) => step.meanRainMmH))

  useEffect(() => {
    if (!isPlaying || isLoading) return undefined
    if (selectedIndex >= steps.length - 1) { setIsPlaying(false); return undefined }
    const timeout = window.setTimeout(() => onSourceChange(steps[selectedIndex + 1]!.sourceAt), 700)
    return () => window.clearTimeout(timeout)
  }, [isLoading, isPlaying, onSourceChange, selectedIndex, steps])

  const select = (index: number) => {
    const next = steps[index]
    if (!next || isLoading) return
    setIsPlaying(false)
    onSourceChange(next.sourceAt)
  }

  const togglePlay = () => {
    if (isPlaying) { setIsPlaying(false); return }
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
        aria-label={`${formatTime(step.sourceAt)} · mưa trung bình ${step.meanRainMmH.toFixed(2)} mm/h`}
        aria-pressed={index === selectedIndex}
        className={index === selectedIndex ? 'is-current' : index < selectedIndex ? 'is-past' : ''}
        disabled={isLoading}
        key={step.sourceAt}
        onClick={() => select(index)}
        style={{ height: 10 + step.meanRainMmH / maxRain * 20 }}
        title={`${formatTime(step.sourceAt)} · ${step.meanRainMmH.toFixed(2)} mm/h`}
        type="button"
      />)}</div>
      <p><span>{steps[0] ? formatTime(steps[0].sourceAt) : '—'}</span><span>{formatTime(selectedSourceAt)}</span><span>{steps.at(-1) ? formatTime(steps.at(-1)!.sourceAt) : '—'}</span></p>
    </div>
    <em>MODEL · DỰ BÁO +5 PHÚT<br /><b>{isLoading ? 'Đang chạy LightGBM…' : `Đang xem ${formatTime(selectedSourceAt)}`}</b></em>
  </div>
}

function formatTime(sourceAt: string) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(sourceAt))
}
