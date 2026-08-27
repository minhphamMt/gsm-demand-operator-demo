import { BadgeCheck, Sparkles } from 'lucide-react'

import type { PipelinePlan, PipelinePlanSet } from '@/features/operator-pipeline/model/pipelineRun'
import { formatCurrency } from '@/shared/lib/format'

const strategyLabel: Record<string, string> = {
  MIN_COST: 'Chi phí thấp nhất',
  BALANCED: 'Cân bằng',
  MIN_ETA: 'ETA tốt nhất',
}

function PlanCard({ plan, recommended }: { plan: PipelinePlan; recommended: boolean }) {
  return (
    <article className={`nfp-card px-3 py-2.5 ${recommended ? 'is-active' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-[var(--nfp-ink)]">{plan.plan_id}</span>
        <span className="text-[10px] text-[var(--nfp-muted)]">{strategyLabel[plan.strategy] ?? plan.strategy}</span>
        {recommended && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--nfp-accent-fill)] px-2 py-0.5 text-[9px] font-bold text-white">
            <BadgeCheck className="size-3" />Khuyến nghị
          </span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <PlanStat label="Điều xe" value={`${plan.total_units} xe`} />
        <PlanStat label="Chặng" value={String(plan.move_count)} />
        <PlanStat label="Chi phí" value={formatCurrency(plan.total_cost)} />
        <PlanStat label="Còn thiếu" value={`${plan.residual_zone_count} zone`} />
      </dl>
    </article>
  )
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{label}</dt>
      <dd className="text-[11px] font-bold text-[var(--nfp-ink)]">{value}</dd>
    </div>
  )
}

export function PlanSetComparison({ planSet, recommendedPlanId }: { planSet: PipelinePlanSet; recommendedPlanId: string | undefined }) {
  const plans = planSet.plans
  const recommended = plans.find((plan) => plan.plan_id === recommendedPlanId)

  if (planSet.converged) {
    const plan = recommended ?? plans[0]
    if (!plan) return null
    return (
      <div className="space-y-2">
        <PlanCard plan={plan} recommended />
        <p className="rounded-lg border border-[var(--nfp-warn)]/30 bg-[var(--nfp-warn-soft)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--nfp-warn)]" role="note">
          <Sparkles className="mr-1 inline size-3 align-[-2px]" />
          Ba chiến lược (chi phí / cân bằng / ETA) cho ra cùng một phương án: với dữ liệu và ngưỡng
          hiện tại, chi phí và ETA cùng tăng theo quãng đường nên không có đánh đổi giữa chúng.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {plans.map((plan) => <PlanCard key={plan.plan_id} plan={plan} recommended={plan.plan_id === recommendedPlanId} />)}
    </div>
  )
}
