import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OperationsReport } from '@/features/operator-data'
import { budgetLifecycleRows } from '@/features/operator-reports/model/reportChartData'
import { formatCurrency } from '@/shared/lib/format'

const compactVnd = (value: number) => value >= 1_000_000
  ? `${(value / 1_000_000).toFixed(1)}tr`
  : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value)

export function ReportBudgetChart({ summary }: { summary: OperationsReport['summary'] }) {
  const rows = budgetLifecycleRows(summary)
  return <div aria-label="Biểu đồ vòng đời ngân sách ghi nhận trong DB" className="h-64" role="img">
    <ResponsiveContainer height="100%" width="100%"><BarChart data={rows} margin={{ bottom: 8, left: 8, right: 12, top: 12 }}>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" interval={0} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={compactVnd} tickLine={false} width={48} />
      <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => formatCurrency(Number(value))} />
      <Bar dataKey="amount" fill="#0f766e" isAnimationActive={false} name="Giá trị" radius={[5, 5, 0, 0]} />
    </BarChart></ResponsiveContainer>
  </div>
}
