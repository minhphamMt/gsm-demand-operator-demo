import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { ScenarioComparison } from '@/features/operator-data'
import { scenarioMetricSummary } from '@/features/operator-reports/model/scenarioMetricPresentation'

const LABELS: Record<ScenarioComparison['scenarios'][number]['type'], string> = {
  NO_ACTION: 'Không làm gì',
  RELOCATION: 'Điều chuyển',
  ACTIVATION: 'Kích hoạt',
  HYBRID: 'Kết hợp',
}

const chartTheme = {
  grid: '#2a3941',
  muted: '#90a09e',
  ink: '#f0f5f2',
  teal: '#54d4c1',
  amber: '#eeb151',
  panel: '#172128',
}

export function ScenarioComparisonChart({ scenarios }: { scenarios: ScenarioComparison['scenarios'] }) {
  const rows = scenarios.map((scenario) => ({
    label: LABELS[scenario.type],
    ...scenarioMetricSummary(scenario),
  }))
  return <div aria-label="Biểu đồ so sánh mức đáp ứng và thiếu hụt giữa các kịch bản" className="h-64" role="img">
    <ResponsiveContainer height="100%" width="100%"><ComposedChart data={rows} margin={{ left: 4, right: 4, top: 14 }}>
      <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 10 }} tickLine={false} />
      <YAxis allowDecimals={false} tick={{ fill: chartTheme.muted, fontSize: 10 }} tickLine={false} yAxisId="cars" />
      <YAxis domain={[0, 100]} hide orientation="right" yAxisId="rate" />
      <Tooltip contentStyle={{ backgroundColor: chartTheme.panel, border: `1px solid ${chartTheme.grid}`, borderRadius: 8, color: chartTheme.ink }} labelStyle={{ color: chartTheme.ink }} itemStyle={{ color: chartTheme.ink }} />
      <Legend wrapperStyle={{ color: chartTheme.muted, fontSize: 11 }} />
      <Bar dataKey="unmetDemand" fill={chartTheme.amber} isAnimationActive={false} name="Còn thiếu (xe)" radius={[4, 4, 0, 0]} yAxisId="cars" />
      <Line dataKey="fulfillmentRate" dot={{ fill: chartTheme.teal, r: 4 }} isAnimationActive={false} name="Đáp ứng (%)" stroke={chartTheme.teal} strokeWidth={3} type="monotone" yAxisId="rate" />
    </ComposedChart></ResponsiveContainer>
  </div>
}
