import { ArrowRight, MapPin, Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import type { Zone } from '@/features/operator-data'
import { Card } from '@/shared/components/ui/Card'

type ForecastPanelProps = { forecastMinutes: number; onSelect: (zoneId: string) => void; zones: readonly Zone[] }

export function ForecastPanel({ forecastMinutes, onSelect, zones }: ForecastPanelProps) {
  const rankedZones = [...zones].sort((left, right) => right.gap - left.gap).slice(0, 3)
  const totalGap = zones.reduce((sum, zone) => sum + zone.gap, 0)
  const criticalZones = zones.filter((zone) => zone.severity === 'Critical').length
  const confidenceValues = zones.flatMap((zone) => zone.confidence === null ? [] : [zone.confidence])
  const averageConfidence = confidenceValues.length ? `${Math.round(confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length)}%` : 'Chưa có'
  const timeLabel = forecastMinutes === 0 ? 'Hiện tại' : `Dự báo +${forecastMinutes} phút`

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
      <div className="bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-white">
        <p className="text-xs font-semibold text-white/80">TÌNH HÌNH CUNG — CẦU</p>
        <div className="mt-1 flex items-end justify-between gap-2"><h2 className="text-lg font-bold">{timeLabel}</h2><span className="rounded-full bg-white/20 px-2 py-1 text-[11px] font-semibold">{forecastMinutes === 0 ? 'Snapshot DB' : 'Dự báo mô phỏng'}</span></div>
      </div>
      <dl className="grid grid-cols-3 border-b border-slate-100 bg-cyan-50/50 px-2 py-2 text-center">
        <Metric label="Thiếu xe" value={totalGap} />
        <Metric label="Vùng đỏ" value={criticalZones} />
        <Metric label="Tin cậy" value={averageConfidence} />
      </dl>
      <div className="min-h-0 flex-1 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Vùng cần chú ý</p><span className="text-[11px] text-muted">Chạm để xem</span></div>
        <div className="space-y-1.5">
          {rankedZones.map((zone, index) => <button className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-1.5 text-left transition hover:border-cyan-100 hover:bg-cyan-50" key={zone.id} onClick={() => onSelect(zone.id)} type="button"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{zone.label}</span><span className="flex items-center gap-1 text-[11px] text-muted"><MapPin className="size-3" />Cung {zone.supply} · Cầu {zone.demand}</span></span><span className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">-{zone.gap}</span></button>)}
        </div>
      </div>
      <div className="border-t border-slate-100 p-3"><Link className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-100" to="/operator/plans"><span className="flex items-center gap-2"><Sparkles className="size-4" />Xem gợi ý điều phối</span><ArrowRight className="size-4" /></Link></div>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="border-r border-cyan-100 last:border-r-0"><dd className="text-lg font-bold text-ink">{value}</dd><dt className="text-[10px] font-medium text-muted">{label}</dt></div>
}
