import { SlidersHorizontal } from 'lucide-react'

// §3.7: ngưỡng do người vận hành kéo. Khác thanh cân bằng §3.4 ở chỗ kéo được.
//
// Cố ý **chỉ là ngưỡng hiển thị của phiên xem**: ngưỡng chính sách thật nằm ở
// config/policy.yaml và chỉ src/common/policy.py được đọc/ghi (CLAUDE.md §3 #2).
// Kéo thanh này không đổi hành vi của Model 2, của optimizer, hay của bất kỳ quyết định nào.

const maxThreshold = 200

export function AlertThresholdSlider({ value, onChange, current }: {
  value: number
  onChange: (value: number) => void
  current: number
}) {
  const isBreached = current > value
  return (
    <section className="nfp-card space-y-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]" htmlFor="nfp-alert-threshold">
          <SlidersHorizontal className="size-3" />
          Ngưỡng cảnh báo thiếu hụt
        </label>
        <span className={`text-sm font-bold ${isBreached ? 'text-[var(--nfp-crit)]' : 'text-[var(--nfp-ink)]'}`}>
          {current} / {value} xe
        </span>
      </div>
      <input
        aria-describedby="nfp-alert-threshold-note"
        className="w-full accent-[var(--nfp-accent)]"
        id="nfp-alert-threshold"
        max={maxThreshold}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={5}
        type="range"
        value={value}
      />
      <p className="text-[10px] leading-relaxed text-[var(--nfp-muted)]" id="nfp-alert-threshold-note">
        Ngưỡng hiển thị của phiên xem này. Không ghi vào <code>policy.yaml</code> và không đổi
        ngưỡng hotspot mà Model 2 đang dùng.
      </p>
      {isBreached && (
        <p className="text-[11px] font-semibold text-[var(--nfp-crit)]" role="status">
          Thiếu hụt vượt ngưỡng theo dõi — cân nhắc chạy phân tích và tạo phương án.
        </p>
      )}
    </section>
  )
}
