import { BrainCircuit, CloudRain, Database, Radio } from 'lucide-react'

import type { AiSnapshotStatus } from '@/features/operator-data'
import { formatTime } from '@/shared/lib/format'

type ForecastToolbarProps = {
  ai?: AiSnapshotStatus | undefined
  forecastMinutes: number
  generatedAt: string
  onForecastChange: (minute: number) => void
  zoneCount: number
}

const horizons = [0, 15, 30] as const

export function ForecastToolbar({ ai, forecastMinutes, generatedAt, onForecastChange, zoneCount }: ForecastToolbarProps) {
  const pipelineLabel = ai?.forecastMode === 'live_snapshot_baseline'
    ? 'Baseline snapshot live → Hotspot detection → Greedy optimizer'
    : ai?.modelVersion
      ? `${ai.modelVersion} → Hotspot detection → Greedy optimizer`
      : 'Chưa có forecast AI cho snapshot này'

  return (
    <section className="overflow-hidden rounded-panel border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-teal-300"><BrainCircuit className="size-5" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-bold text-slate-950">Trung tâm điều phối AI · Hà Nội</h1><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><Radio className="size-3" />Live</span></div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span className="flex items-center gap-1"><CloudRain className="size-3.5" />Khu vực vận hành Hà Nội</span><span>•</span><span>{zoneCount} zone từ DB</span>{ai && <><span>•</span><span>{ai.liveZones}/{ai.registeredZones} zone có dữ liệu live</span></>}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 border-slate-200 text-xs text-slate-500 sm:border-r sm:pr-4"><Database className="size-4 text-teal-600" /><span>Dữ liệu đồng bộ<br /><strong className="font-semibold text-slate-800">{formatTime(generatedAt)}</strong></span></div>
          <fieldset className="flex rounded-lg border border-slate-300 bg-slate-50 p-1">
            <legend className="sr-only">Chọn thời điểm dự báo</legend>
            {horizons.map((minute) => <button aria-pressed={forecastMinutes === minute} className={`min-h-8 rounded-md px-3 text-xs font-bold transition ${forecastMinutes === minute ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`} key={minute} onClick={() => onForecastChange(minute)} type="button">{minute === 0 ? 'Hiện tại' : `${minute} phút`}</button>)}
          </fieldset>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500"><span className="font-bold uppercase tracking-[0.12em] text-slate-800">Mô hình</span><span>{pipelineLabel}</span><span className="ml-auto hidden font-semibold text-teal-700 sm:inline">Human-in-the-loop</span></div>
    </section>
  )
}
