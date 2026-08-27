import { FlaskConical, Radar, RefreshCw } from 'lucide-react'

import type { ForecastHorizon } from '@/features/operator-data'
import { horizonLabel, isExtrapolated, panelHorizons, type PanelHorizon } from '@/features/operator-pipeline/model/horizonProjection'

// Cấu hình chạy dự báo — tự động hoặc thủ công (agent/07-Design §7 bước 1–2).
//
// Hai loại mốc thời gian ở đây **không giống nhau**, nên không gộp thành một dải:
//   · MỐC MODEL 5/10/15 gọi Model 1 thật, đổi cả dữ liệu bản đồ.
//   · CHIẾU +30 chỉ ngoại suy số hiển thị trong panel, không chạy model, không tạo phương án.

export type ForecastControl = {
  horizons: readonly ForecastHorizon[]
  horizon: ForecastHorizon
  isRunning: boolean
  blockedReason: string | undefined
  auto: { isEnabled: boolean; intervalMinutes: number; isAutoPlan: boolean }
  intervals: readonly number[]
  onHorizonChange: (horizon: ForecastHorizon) => void
  onRun: () => void
  onRefresh: () => void
  onAutoChange: (auto: { isEnabled: boolean; intervalMinutes: number; isAutoPlan: boolean }) => void
}

export function ForecastConfig({ control, projection, onProjectionChange }: {
  control: ForecastControl
  projection: PanelHorizon
  onProjectionChange: (horizon: PanelHorizon) => void
}) {
  const { auto } = control
  return (
    <section aria-label="Cấu hình dự báo" className="nfp-card space-y-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <Radar className={`size-3.5 text-[var(--nfp-accent)] ${control.isRunning ? 'animate-spin' : ''}`} />
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">Dự báo cung–cầu</h3>
      </div>

      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">Mốc model</p>
        <div className="flex gap-1" role="group">
          {control.horizons.map((value) => (
            <button
              aria-pressed={control.horizon === value}
              className={chipClass(control.horizon === value)}
              key={value}
              onClick={() => control.onHorizonChange(value)}
              type="button"
            >
              {value} phút
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-md bg-[var(--nfp-accent-fill)] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-45"
          disabled={control.isRunning || Boolean(control.blockedReason)}
          onClick={control.onRun}
          type="button"
        >
          {control.isRunning ? 'Đang chạy model…' : 'Chạy dự báo'}
        </button>
        <button
          aria-label="Làm mới dữ liệu"
          className="grid size-9 flex-none place-items-center rounded-md border border-[var(--nfp-line)] text-[var(--nfp-muted)] hover:bg-[var(--nfp-raise-2)]"
          onClick={control.onRefresh}
          type="button"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      {control.blockedReason && (
        <p className="text-[10px] leading-relaxed text-[var(--nfp-warn)]" role="status">{control.blockedReason}</p>
      )}

      <div className="space-y-2 border-t border-[var(--nfp-line)] pt-2.5">
        <label className="flex items-center gap-2 text-[11px] text-[var(--nfp-ink)]">
          <input
            checked={auto.isEnabled}
            className="size-3.5 accent-[var(--nfp-accent)]"
            onChange={(event) => control.onAutoChange({ ...auto, isEnabled: event.target.checked })}
            type="checkbox"
          />
          Chạy tự động theo chu kỳ
        </label>
        <div className="flex items-center gap-2 pl-5">
          <label className="text-[10px] text-[var(--nfp-muted)]" htmlFor="nfp-auto-interval">Mỗi</label>
          <select
            className="rounded border border-[var(--nfp-line)] bg-[var(--nfp-raise)] px-1.5 py-0.5 text-[11px] text-[var(--nfp-ink)] disabled:opacity-45"
            disabled={!auto.isEnabled}
            id="nfp-auto-interval"
            onChange={(event) => control.onAutoChange({ ...auto, intervalMinutes: Number(event.target.value) })}
            value={auto.intervalMinutes}
          >
            {control.intervals.map((value) => <option key={value} value={value}>{value} phút</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2 pl-5 text-[11px] text-[var(--nfp-ink)]">
          <input
            checked={auto.isAutoPlan}
            className="mt-0.5 size-3.5 accent-[var(--nfp-accent)]"
            disabled={!auto.isEnabled}
            onChange={(event) => control.onAutoChange({ ...auto, isAutoPlan: event.target.checked })}
            type="checkbox"
          />
          <span>
            Tự tính phương án khi phát hiện hotspot
            <span className="mt-0.5 block text-[10px] text-[var(--nfp-muted)]">
              Dừng ở trạng thái đề xuất — phát lệnh vẫn phải qua cổng phê duyệt.
            </span>
          </span>
        </label>
      </div>

      <div className="border-t border-[var(--nfp-line)] pt-2.5">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--nfp-muted)]">Chiếu số trong panel</p>
        <div className="flex gap-1" role="group">
          {panelHorizons.map((value) => (
            <button
              aria-pressed={projection === value}
              className={chipClass(projection === value)}
              key={value}
              onClick={() => onProjectionChange(value)}
              type="button"
            >
              {horizonLabel[value]}
            </button>
          ))}
        </div>
        {isExtrapolated(projection) && (
          <p className="mt-2 flex gap-2 rounded-lg border border-[var(--nfp-warn)]/30 bg-[var(--nfp-warn-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--nfp-warn)]" role="note">
            <FlaskConical className="mt-0.5 size-3.5 flex-none" />
            <span>
              <b>Ngoại suy — không phải output model.</b> Model 1 chỉ dự báo tới +15 phút; mốc này
              kéo dài thêm một lần độ dốc quan sát → +15. Không dùng để tạo hoặc duyệt phương án.
              <em className="ml-1 not-italic opacity-80">[ASSUMPTION-44]</em>
            </span>
          </p>
        )}
      </div>
    </section>
  )
}

function chipClass(isActive: boolean): string {
  return `rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors ${
    isActive
      ? 'border-[var(--nfp-accent)] bg-[var(--nfp-accent-fill)] text-white'
      : 'border-[var(--nfp-line)] text-[var(--nfp-muted)] hover:text-[var(--nfp-ink)]'
  }`
}
