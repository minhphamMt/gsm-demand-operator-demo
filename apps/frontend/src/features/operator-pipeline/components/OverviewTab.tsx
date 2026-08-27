import { useState } from 'react'

import type { Snapshot } from '@/features/operator-data'
import { AlertThresholdSlider } from '@/features/operator-pipeline/components/AlertThresholdSlider'
import { ForecastConfig, type ForecastControl } from '@/features/operator-pipeline/components/ForecastConfig'
import { MetricTrendChart } from '@/features/operator-pipeline/components/MetricTrendChart'
import { SystemKpiHeader } from '@/features/operator-pipeline/components/SystemKpiHeader'
import { ZoneBreakdownTable } from '@/features/operator-pipeline/components/ZoneBreakdownTable'
import type { PanelHorizon } from '@/features/operator-pipeline/model/horizonProjection'
import type { MetricKey, MetricPoint } from '@/features/operator-pipeline/model/metricHistory'
import { buildSystemHealth, defaultResidualGapAlert } from '@/features/operator-pipeline/model/systemHealth'

// Tab Overview — lớp giám sát sức khoẻ hệ thống (agent/07-Design §3), độc lập với việc có
// pipeline nào đang chạy hay không.

export function OverviewTab({ snapshot, history, horizon, onHorizonChange, isLive, planStatus, forecastControl, contextLabel }: {
  snapshot: Snapshot
  history: readonly MetricPoint[]
  horizon: PanelHorizon
  onHorizonChange: (horizon: PanelHorizon) => void
  isLive: boolean
  planStatus: readonly { label: string; value: string }[] | undefined
  forecastControl: ForecastControl | undefined
  contextLabel: string | undefined
}) {
  const [metric, setMetric] = useState<MetricKey>('residualGap')
  const [alertThreshold, setAlertThreshold] = useState(defaultResidualGapAlert)
  const health = buildSystemHealth(snapshot, horizon)

  return (
    <div className="space-y-4">
      <SystemKpiHeader contextLabel={contextLabel} health={health} isLive={isLive} modelVersion={snapshot.ai?.modelVersion ?? undefined} />
      {forecastControl && (
        <ForecastConfig control={forecastControl} onProjectionChange={onHorizonChange} projection={horizon} />
      )}
      <MetricTrendChart
        alertThreshold={metric === 'residualGap' ? alertThreshold : undefined}
        history={history}
        metric={metric}
        onMetricChange={setMetric}
      />
      <AlertThresholdSlider current={health.residualGap} onChange={setAlertThreshold} value={alertThreshold} />
      {planStatus && planStatus.length > 0 && <PlanStatusTiles tiles={planStatus} />}
      <ZoneBreakdownTable alertThreshold={alertThreshold} rows={health.breakdown} />
    </div>
  )
}

// Bốn ô này nói về **phương án đang xét**, không phải sức khoẻ hệ thống — trước nằm ở bảng
// chỉ huy, chuyển vào đây khi khối đó bị bỏ để không mất số liệu.
function PlanStatusTiles({ tiles }: { tiles: readonly { label: string; value: string }[] }) {
  return (
    <section aria-label="Trạng thái phương án" className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">Trạng thái phương án</h3>
      <dl className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div className="nfp-card px-2.5 py-2" key={tile.label}>
            <dt className="text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{tile.label}</dt>
            <dd className="mt-0.5 truncate text-[12px] font-bold text-[var(--nfp-ink)]" title={tile.value}>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
