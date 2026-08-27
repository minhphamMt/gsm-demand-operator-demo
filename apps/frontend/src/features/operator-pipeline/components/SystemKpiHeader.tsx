import { Activity, TriangleAlert } from 'lucide-react'

import { formatNumber } from '@/shared/lib/format'
import type { SystemHealth } from '@/features/operator-pipeline/model/systemHealth'

// §3.1–3.4 của agent/07-Design: huy hiệu AI, cặp chỉ số cung–cầu, thanh cân bằng chỉ để đọc.

export function SystemKpiHeader({ health, isLive, modelVersion, contextLabel }: {
  health: SystemHealth
  isLive: boolean
  modelVersion: string | undefined
  contextLabel: string | undefined
}) {
  const fulfilment = health.fulfillmentRatePct
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`relative grid size-12 flex-none place-items-center rounded-full bg-[var(--nfp-accent-soft)] text-sm font-black text-[var(--nfp-accent)] ${isLive ? 'nfp-pulse' : ''}`}>
          AI
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold tracking-wide text-[var(--nfp-ink)]">
            {contextLabel ?? 'Không rõ điều kiện vận hành'}
          </p>
          <p className="truncate text-[10px] text-[var(--nfp-muted)]">{modelVersion ?? 'model chưa xác định'}</p>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--nfp-accent)]">
            <span className={`size-1.5 rounded-full ${isLive ? 'bg-[var(--nfp-ok)]' : 'bg-[var(--nfp-idle)]'}`} />
            {isLive ? 'Đang giám sát' : 'Xem lại mốc quá khứ'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">Tỷ lệ đáp ứng</p>
          <p className="text-3xl font-black leading-none text-[var(--nfp-accent)]">
            {fulfilment === null ? '—' : `${fulfilment.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiTile label="Tổng cung khả dụng" unit="xe" value={health.totalSupply} />
        <KpiTile label="Cầu đang chờ" unit="chuyến" tone="demand" value={health.activeDemand} />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">
          <span>Áp lực cầu trên cung</span>
          <span className="text-[var(--nfp-ink)]">{health.demandPressurePct.toFixed(1)}%</span>
        </div>
        <BalanceBar percent={health.demandPressurePct} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Thiếu hụt" value={`${formatNumber(health.residualGap)} xe`} warn={health.residualGap > 0} />
        <MiniStat label="Chờ proxy" value={health.avgWaitProxy === null ? '—' : `${health.avgWaitProxy.toFixed(1)}′`} />
        <MiniStat label="Hotspot" value={String(health.hotspotCount)} warn={health.hotspotCount > 0} />
      </dl>

      <p className="text-[10px] text-[var(--nfp-muted)]">
        {health.observedZoneCount}/{health.registeredZoneCount} zone có quan sát hợp lệ
        {health.observedZoneCount < health.registeredZoneCount && (
          <span className="ml-1 text-[var(--nfp-warn)]">
            <TriangleAlert className="mr-0.5 inline size-3 align-[-2px]" />thiếu dữ liệu
          </span>
        )}
      </p>
    </section>
  )
}

function KpiTile({ label, unit, value, tone = 'supply' }: { label: string; unit: string; value: number; tone?: 'supply' | 'demand' }) {
  return (
    <div className="nfp-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-black leading-none ${tone === 'demand' ? 'text-[var(--nfp-warn)]' : 'text-[var(--nfp-ink)]'}`}>
        {formatNumber(value)}
        <span className="ml-1 text-[11px] font-semibold text-[var(--nfp-muted)]">{unit}</span>
      </p>
    </div>
  )
}

// Chỉ số đọc (§3.4): không kéo được, khác với thanh ngưỡng cấu hình ở §3.7.
function BalanceBar({ percent }: { percent: number }) {
  return (
    <div aria-hidden className="relative h-1.5 rounded-full bg-[var(--nfp-line)]">
      <div className="h-full rounded-full bg-[var(--nfp-accent)]" style={{ width: `${percent}%` }} />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--nfp-bg)] bg-[var(--nfp-accent)]"
        style={{ left: `${percent}%` }}
      />
    </div>
  )
}

function MiniStat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="nfp-card px-2 py-1.5">
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${warn ? 'text-[var(--nfp-warn)]' : 'text-[var(--nfp-ink)]'}`}>
        {warn && <Activity className="mr-1 inline size-3 align-[-2px]" />}
        {value}
      </dd>
    </div>
  )
}
