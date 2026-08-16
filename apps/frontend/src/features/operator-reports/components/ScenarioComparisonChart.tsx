import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { ScenarioComparison } from '@/features/operator-data'
import { scenarioMetricSummary } from '@/features/operator-reports/model/scenarioMetricPresentation'

const LABELS: Record<ScenarioComparison['scenarios'][number]['type'], string> = {
  NO_ACTION: 'Không làm gì',
  RELOCATION: 'Điều chuyển',
  ACTIVATION: 'Kích hoạt',
  HYBRID: 'Kết hợp',
}

export function ScenarioComparisonChart({ scenarios }: { scenarios: ScenarioComparison['scenarios'] }) {
  const rows = scenarios.map((scenario) => ({
    label: LABELS[scenario.type],
    ...scenarioMetricSummary(scenario),
  }))
  return <div aria-label="Biểu đồ so sánh mức đáp ứng và thiếu hụt giữa các kịch bản" className="h-64" role="img">
    <ResponsiveContainer height="100%" width="100%"><ComposedChart data={rows} margin={{ left: 4, right: 4, top: 14 }}>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
      <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} yAxisId="cars" />
      <YAxis domain={[0, 100]} hide orientation="right" yAxisId="rate" />
      <Tooltip />
      <Legend />
      <Bar dataKey="unmetDemand" fill="#f59e0b" isAnimationActive={false} name="Còn thiếu (xe)" radius={[4, 4, 0, 0]} yAxisId="cars" />
      <Line dataKey="fulfillmentRate" dot={{ fill: '#0f766e', r: 4 }} isAnimationActive={false} name="Đáp ứng (%)" stroke="#0f766e" strokeWidth={3} type="monotone" yAxisId="rate" />
    </ComposedChart></ResponsiveContainer>
  </div>
}
