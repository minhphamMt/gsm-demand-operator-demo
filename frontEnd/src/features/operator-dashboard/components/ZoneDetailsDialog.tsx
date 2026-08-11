import { MapPin, Sparkles } from 'lucide-react'

import type { Zone } from '@/features/operator-data'
import { Dialog } from '@/shared/components/ui/Dialog'
import { SeverityBadge } from '@/shared/components/ui/SeverityBadge'
import { formatNumber } from '@/shared/lib/format'

type ZoneDetailsDialogProps = {
  forecastMinutes: number
  onClose: () => void
  zone?: Zone | undefined
}

export function ZoneDetailsDialog({ forecastMinutes, onClose, zone }: ZoneDetailsDialogProps) {
  const timeLabel = forecastMinutes === 0 ? 'Dữ liệu hiện tại' : `Dự báo sau ${forecastMinutes} phút`
  const demandRange = forecastMinutes === 15 ? zone?.demandRange15 : forecastMinutes === 30 ? zone?.demandRange30 : null
  const supplyRange = forecastMinutes === 15 ? zone?.supplyRange15 : forecastMinutes === 30 ? zone?.supplyRange30 : null

  return (
    <Dialog isOpen={Boolean(zone)} onClose={onClose} title={zone ? `Chi tiết ${zone.label}` : 'Chi tiết zone'}>
      {zone && <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 p-4 text-white">
          <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-xs font-semibold text-white/80"><MapPin className="size-3.5" />{timeLabel}</p><p className="mt-1 text-xl font-bold">{zone.label}</p></div><span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">{zone.confidence === null ? 'Chưa có độ tin cậy' : `Tin cậy ${zone.confidence}%`}</span></div>
          <p className="mt-3 text-xs text-white/75">{zone.zoneCode ?? zone.h3Index} · {zone.sourceCellCount ?? 0} ô H3 nguồn</p>
        </div>
        {zone.dataStatus === 'no_live_cells' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Zone đã có trong DB và đồng bộ với AI, nhưng pipeline chưa nạp ô H3/snapshot live cho khu vực này. Các giá trị cung–cầu chưa được xem là dữ liệu vận hành.</div>}
        <dl className="grid grid-cols-3 gap-2.5">
          <Metric label="Xe sẵn sàng" value={formatNumber(zone.supply)} />
          <Metric label="Nhu cầu" value={formatNumber(zone.demand)} />
          <Metric emphasis label="Thiếu hụt" value={zone.gap > 0 ? `-${formatNumber(zone.gap)}` : '0'} />
        </dl>
        {demandRange && supplyRange && <div className="grid grid-cols-2 gap-2 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs text-cyan-900"><div><span className="block text-cyan-700">Khoảng cầu p10–p90</span><strong className="mt-1 block">{formatNumber(demandRange[0])}–{formatNumber(demandRange[1])}</strong></div><div><span className="block text-cyan-700">Khoảng cung p10–p90</span><strong className="mt-1 block">{formatNumber(supplyRange[0])}–{formatNumber(supplyRange[1])}</strong></div></div>}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><div><p className="text-xs text-muted">Mức độ ưu tiên</p><p className="mt-1 text-sm font-semibold text-ink">Đánh giá theo chênh lệch cung — cầu</p></div><SeverityBadge severity={zone.severity} /></div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-sm text-brand-800"><p className="flex items-center gap-2 font-bold"><Sparkles className="size-4" />Khuyến nghị từ AI</p><p className="mt-1.5 leading-5">Ưu tiên điều chuyển xe từ zone lân cận; chỉ kích hoạt offer nếu mức thiếu vẫn còn cao sau ETA dự kiến.</p></div>
      </div>}
    </Dialog>
  )
}

function Metric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return <div className={`rounded-xl border p-3 text-center ${emphasis ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-white'}`}><dt className="text-[11px] font-medium text-muted">{label}</dt><dd className={`mt-1 text-xl font-bold ${emphasis ? 'text-rose-600' : 'text-ink'}`}>{value}</dd></div>
}
