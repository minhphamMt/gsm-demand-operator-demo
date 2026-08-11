import { CloudRain, Database, Radio } from 'lucide-react'

import type { AiSnapshotStatus } from '@/features/operator-data'
import { formatTime } from '@/shared/lib/format'

type Props = { ai?: AiSnapshotStatus | undefined; forecastMinutes: number; generatedAt: string; onForecastChange: (minute: number) => void; zoneCount: number }
const horizons = [0, 15, 30] as const

export function ForecastToolbar({ ai, forecastMinutes, generatedAt, onForecastChange, zoneCount }: Props) {
  const ready = ai?.registeredZones === 30 && ai.liveZones === 30
  return <section className="overflow-hidden rounded-lg border border-slate-300 bg-white">
    <div className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
      <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="text-base font-black">Điều hành AI · Hà Nội</h1><span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Radio className="size-3" />{ready ? '30/30 LIVE' : 'CHỜ DỮ LIỆU'}</span></div><p className="mt-0.5 text-[11px] text-slate-500">30 zone DB · Human-in-the-loop</p></div>
      <div className="hidden h-7 w-px bg-slate-200 md:block" />
      <div className="flex items-center gap-2 text-xs"><CloudRain className="size-4 text-sky-600" /><span><b>Kịch bản:</b> vận hành hiện tại</span></div>
      <div className="ml-auto flex items-center gap-3"><span className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex"><Database className="size-4 text-teal-600" />{zoneCount} zone · {formatTime(generatedAt)}</span><fieldset className="flex rounded-md border border-slate-300 bg-slate-100 p-0.5"><legend className="sr-only">Chọn thời điểm dự báo</legend>{horizons.map((minute) => <button key={minute} type="button" aria-pressed={forecastMinutes === minute} onClick={() => onForecastChange(minute)} className={`min-h-8 rounded px-3 text-[11px] font-bold ${forecastMinutes === minute ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{minute === 0 ? 'Hiện tại' : `${minute} phút`}</button>)}</fieldset></div>
    </div>
    <div className="flex h-7 items-center border-t border-slate-200 bg-slate-50 px-4 text-[10px] text-slate-500"><b className="mr-2 uppercase tracking-wider text-slate-800">Mô hình</b>{ai?.modelVersion ?? 'Chưa có forecast cho snapshot'}<span className="ml-auto font-bold text-teal-700">AI hỗ trợ · Người vận hành quyết định</span></div>
  </section>
}
