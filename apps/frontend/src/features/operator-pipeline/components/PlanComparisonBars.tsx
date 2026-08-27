import type { PipelinePlan } from '@/features/operator-pipeline/model/pipelineRun'
import { planScoreLabel, scoreMetric, type PlanMetricKey } from '@/features/operator-pipeline/model/planScores'

// Thanh so sánh phương án (02-technical-spec §2.6: `scores.*` là thanh so sánh màu).
//
// Mỗi chỉ số một hàng, chuẩn hoá theo **giá trị lớn nhất của chính hàng đó** — bốn chỉ số này
// khác đơn vị (xe / VNĐ / step / zone) nên không được đặt chung một trục. Giá trị thật luôn
// hiện bằng số bên cạnh thanh, thanh chỉ để so nhanh chứ không thay số.

type Metric = { key: PlanMetricKey; label: string; unit: string }

const metrics: readonly Metric[] = [
  { key: 'total_units', label: 'Xe điều', unit: 'xe' },
  { key: 'total_cost', label: 'Chi phí', unit: 'đ' },
  { key: 'total_eta_step_units', label: 'ETA tích luỹ', unit: 'step·xe' },
  { key: 'residual_zone_count', label: 'Zone còn thiếu', unit: 'zone' },
]

// Ba mức màu của §2.6: tốt nhất nhóm / trung bình / kém nhất nhóm. Không mã hoá chỉ bằng màu —
// mỗi thanh mang `title` chữ, và giá trị thật luôn in bên cạnh.
const scoreTone: Record<string, string> = {
  GOOD: 'bg-[var(--nfp-accent)]',
  MEDIUM: 'bg-[var(--nfp-warn)]',
  BAD: 'bg-[var(--nfp-crit)]',
}

const strategyLabel: Record<string, string> = {
  MIN_COST: 'Chi phí thấp',
  BALANCED: 'Cân bằng',
  MIN_ETA: 'ETA tốt',
}

export function PlanComparisonBars({ plans, recommendedPlanId }: {
  plans: readonly PipelinePlan[]
  recommendedPlanId: string | undefined
}) {
  if (plans.length < 2) return null

  return (
    <section aria-label="So sánh chỉ số giữa các phương án" className="space-y-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">So sánh phương án</h4>
      {metrics.map((metric) => {
        const max = Math.max(...plans.map((plan) => plan[metric.key]), 1)
        return (
          <div key={metric.key}>
            <p className="mb-1 text-[10px] text-[var(--nfp-muted)]">{metric.label}</p>
            <ul className="space-y-1">
              {plans.map((plan) => {
                const value = plan[metric.key]
                const score = scoreMetric(plans, metric.key, value)
                return (
                  <li className="flex items-center gap-2" key={plan.plan_id}>
                    <span className="w-16 flex-none truncate text-[10px] text-[var(--nfp-muted)]">
                      {strategyLabel[plan.strategy] ?? plan.strategy}
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--nfp-raise-2)]"
                      title={score ? planScoreLabel[score] : 'Chưa so được'}
                    >
                      <span
                        className={`block h-full rounded-full ${score ? scoreTone[score] : 'bg-[var(--nfp-idle)]'}`}
                        style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
                      />
                    </span>
                    <span className={`w-24 flex-none text-right text-[11px] font-bold tabular-nums ${
                      plan.plan_id === recommendedPlanId ? 'text-[var(--nfp-accent)]' : 'text-[var(--nfp-ink)]'
                    }`}>
                      {value.toLocaleString('vi-VN')} <span className="font-normal text-[var(--nfp-muted)]">{metric.unit}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
