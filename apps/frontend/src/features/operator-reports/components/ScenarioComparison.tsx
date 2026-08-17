import { useState } from 'react'
import { Ban, CarFront, CheckCircle2, Combine, Sparkles, TriangleAlert, Zap } from 'lucide-react'

import { useOperatorActions } from '@/features/operator-data'
import type { Proposal, ScenarioComparison as ScenarioComparisonData } from '@/features/operator-data'
import { Card } from '@/shared/components/ui/Card'
import { Select } from '@/shared/components/ui/Field'
import { recommendedScenarioType, scenarioMetricSummary } from '@/features/operator-reports/model/scenarioMetricPresentation'
import { ScenarioComparisonChart } from '@/features/operator-reports/components/ScenarioComparisonChart'

const labels: Record<string, string> = {
  NO_ACTION: 'Không hành động',
  RELOCATION: 'Điều chuyển',
  ACTIVATION: 'Kích hoạt',
  HYBRID: 'Kết hợp',
}

const icons = {
  NO_ACTION: Ban,
  RELOCATION: CarFront,
  ACTIVATION: Zap,
  HYBRID: Combine,
} as const

export function ScenarioComparison({ plans }: { plans: readonly Proposal[] }) {
  const comparable = plans.filter((plan) => plan.forecastRunId)
  const [planId, setPlanId] = useState(comparable[0]?.id ?? '')
  const actions = useOperatorActions()
  const comparison = actions.compareScenarios.data
  const run = () => { if (planId) actions.compareScenarios.mutate(planId) }

  return <Card className="nf-workspace-panel">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-semibold text-slate-950">Chọn phương án để so sánh</h2><p className="mt-1 text-xs text-slate-500">Cùng dữ liệu đầu vào</p></div>
      <div className="flex min-w-72 gap-2">
        <Select aria-label="Phương án so sánh" className="min-w-56" onChange={(event) => setPlanId(event.target.value)} value={planId}>
          {comparable.map((plan) => <option key={plan.id} value={plan.id}>v{plan.version} · {plan.title}</option>)}
        </Select>
        <button className="btn btn-primary" disabled={!planId || actions.compareScenarios.isPending} onClick={run} type="button">{actions.compareScenarios.isPending ? 'Đang tính…' : 'So sánh'}</button>
      </div>
    </div>
    {actions.compareScenarios.isError && <p className="mt-3 text-sm text-rose-700" role="alert">{actions.compareScenarios.error.message}</p>}
    {comparison && <ComparisonResult value={comparison} />}
  </Card>
}

function ComparisonResult({ value }: { value: ScenarioComparisonData }) {
  const recommended = recommendedScenarioType(value.scenarios)
  return <div className="mt-4 space-y-3">
    <div className="nf-compare-ready"><CheckCircle2 size={16} /><span>Đã chuẩn hóa cùng đầu vào</span><small>{value.scenarios.length} kịch bản</small></div>
    <ScenarioComparisonChart scenarios={value.scenarios} />
    <div className="nf-scenario-grid">
      {value.scenarios.map((scenario) => <ScenarioCard isRecommended={scenario.type === recommended} key={scenario.type} scenario={scenario} />)}
    </div>
    <div className="nf-compare-warning"><TriangleAlert size={16} /><span>Chưa có doanh thu thực tế</span></div>
    <details className="nf-technical-details"><summary>Chi tiết kỹ thuật</summary><p>Input {value.commonInputHash.slice(0, 16)}… · Model {value.modelVersion} · Policy {value.policyVersion}</p><p>{value.revenueNotice}</p></details>
  </div>
}

function ScenarioCard({ isRecommended, scenario }: { isRecommended: boolean; scenario: ScenarioComparisonData['scenarios'][number] }) {
  const Icon = icons[scenario.type]
  const metrics = scenarioMetricSummary(scenario)
  return <article className={`nf-scenario-card${isRecommended ? ' is-recommended' : ''}`}>
    <header><span><Icon size={17} /></span><strong>{labels[scenario.type]}</strong>{isRecommended && <b><Sparkles size={12} />Tốt nhất</b>}</header>
    <div className="nf-scenario-metrics"><div><small>Đáp ứng</small><strong>{metrics.fulfillmentRate === null ? '—' : `${metrics.fulfillmentRate.toFixed(1)}%`}</strong></div><div><small>Còn thiếu</small><strong>{metrics.unmetDemand === null ? '—' : `${metrics.unmetDemand.toFixed(1)} xe`}</strong></div></div>
    <progress aria-label={`Tỷ lệ đáp ứng ${labels[scenario.type]}`} max="100" value={metrics.fulfillmentRate ?? 0} />
    <small className="nf-scenario-estimate">Ước tính · có bất định</small>
  </article>
}
