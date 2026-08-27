import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { metricSeries, metricSeriesFor, type MetricKey, type MetricPoint } from '@/features/operator-pipeline/model/metricHistory'
import { formatTimeLabel } from '@/features/operator-pipeline/model/timeLabel'

// §3.5–3.6: một chỉ số mỗi lần vẽ (không hai trục), chọn chỉ số bằng hàng chip bên trên.
// Trục X là các replay step mà phiên xem đã đi qua — xem model/metricHistory.ts về nguồn.

// Recharts nhận màu qua prop chứ không qua class, nên bảng màu sáng khai báo tại đây.
const chartColors = { line: '#0c6e69', grid: '#e9efed', axis: '#6f7f7c', surface: '#ffffff', threshold: '#8a5a05' }
const axisTick = { fill: chartColors.axis, fontSize: 10 }

export function MetricTrendChart({ history, metric, onMetricChange, alertThreshold }: {
  history: readonly MetricPoint[]
  metric: MetricKey
  onMetricChange: (metric: MetricKey) => void
  alertThreshold: number | undefined
}) {
  const series = metricSeriesFor(metric)
  const rows = history.map((point) => ({ label: formatTimeLabel(point.sourceAt), value: point[metric] }))
  const latest = rows.at(-1)?.value

  return (
    <section aria-label={`Xu hướng ${series.label}`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">{series.label}</h3>
        <p className="text-sm font-bold text-[var(--nfp-ink)]">
          {latest === undefined ? '—' : `${round(latest)} ${series.unit}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Chọn chỉ số theo dõi">
        {metricSeries.map((option) => (
          <button
            key={option.key}
            aria-pressed={option.key === metric}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              option.key === metric
                ? 'border-[var(--nfp-accent)] bg-[var(--nfp-accent-soft)] text-[var(--nfp-accent)]'
                : 'border-[var(--nfp-line)] text-[var(--nfp-muted)] hover:text-[var(--nfp-ink)]'
            }`}
            onClick={() => onMetricChange(option.key)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length < 2 ? (
        <p className="nfp-card px-3 py-6 text-center text-[11px] text-[var(--nfp-muted)]">
          Cần ít nhất hai mốc replay để vẽ xu hướng. Chuỗi bắt đầu tích lũy từ lúc mở phiên này.
        </p>
      ) : (
        <div className="h-36" role="img" aria-label={`Biểu đồ ${series.label} theo mốc replay của phiên xem`}>
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={rows} margin={{ left: -22, right: 6, top: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="nfp-trend-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.line} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartColors.line} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--nfp-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" tick={axisTick} tickLine={false} />
              <YAxis axisLine={false} tick={axisTick} tickLine={false} width={46} />
              <Tooltip
                contentStyle={{ background: chartColors.surface, border: `1px solid ${chartColors.grid}`, borderRadius: 8, fontSize: 11 }}
                cursor={{ stroke: chartColors.line, strokeDasharray: '3 3' }}
                formatter={(value) => [`${round(Number(value))} ${series.unit}`, series.label]}
                labelStyle={{ color: chartColors.axis }}
              />
              {alertThreshold !== undefined && (
                <ReferenceLine
                  label={{ fill: chartColors.threshold, fontSize: 9, position: 'insideTopRight', value: 'ngưỡng cảnh báo' }}
                  stroke={chartColors.threshold}
                  strokeDasharray="4 4"
                  y={alertThreshold}
                />
              )}
              <Area
                dataKey="value"
                dot={false}
                activeDot={{ r: 4, fill: chartColors.line, stroke: chartColors.surface, strokeWidth: 2 }}
                fill="url(#nfp-trend-fill)"
                isAnimationActive={false}
                stroke={chartColors.line}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
