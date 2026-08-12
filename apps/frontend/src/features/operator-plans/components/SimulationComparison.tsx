import { ArrowDown, ArrowUp } from 'lucide-react'

import type { Proposal } from '@/features/operator-data'
import { Card } from '@/shared/components/ui/Card'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'
import { formatCurrency, formatNumber } from '@/shared/lib/format'

export function SimulationComparison({ plan }: { plan: Proposal }) {
  if (!plan.simulationAvailable) {
    return <Card><h3 className="font-semibold text-slate-950">Đối chiếu tác động mô phỏng</h3><p className="mt-2 text-sm text-slate-600">Proposal này chưa có kết quả mô phỏng trong DB. Hệ thống không tự suy diễn các chỉ số trước/sau hoặc độ tin cậy.</p></Card>
  }

  const gapReduction = plan.metricsBefore.residualGap > 0
    ? Math.round((1 - plan.metrics.residualGap / plan.metricsBefore.residualGap) * 100)
    : 0
  const rows = [
    { after: `${formatNumber(plan.metrics.fulfillmentRate)}%`, before: `${formatNumber(plan.metricsBefore.fulfillmentRate)}%`, change: `+${formatNumber(plan.metrics.fulfillmentRate - plan.metricsBefore.fulfillmentRate)} điểm`, good: 'up', label: 'Tỷ lệ đáp ứng' },
    { after: `${plan.metrics.residualGap} xe`, before: `${plan.metricsBefore.residualGap} xe`, change: `-${plan.metricsBefore.residualGap - plan.metrics.residualGap} xe`, good: 'down', label: 'Thiếu xe còn lại' },
    { after: `${formatNumber(plan.metrics.avgWaitProxy)} phút`, before: `${formatNumber(plan.metricsBefore.avgWaitProxy)} phút`, change: `-${formatNumber(plan.metricsBefore.avgWaitProxy - plan.metrics.avgWaitProxy)} phút`, good: 'down', label: 'Thời gian chờ dự kiến' },
    { after: `${plan.metrics.expectedTrips}`, before: `${plan.metricsBefore.expectedTrips}`, change: `+${plan.metrics.expectedTrips - plan.metricsBefore.expectedTrips}`, good: 'up', label: 'Chuyến hoàn thành' },
  ] as const

  return (
    <Card className="p-0">
      <div className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-start">
        <div><h3 className="font-semibold text-slate-950">Đối chiếu tác động mô phỏng</h3><p className="mt-1 text-sm text-slate-500">Cùng snapshot {plan.inputSnapshotId}: không điều phối so với phương án hiện tại.</p></div>
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700"><ArrowDown className="size-4" />Gap giảm {gapReduction}%</span>
      </div>
      <DataTable label="So sánh tác động trước và sau">
        <TableHead><tr><th className="px-3 py-3">Chỉ số</th><th className="px-3 py-3">Không hành động</th><th className="px-3 py-3">Theo proposal</th><th className="px-3 py-3">Mức thay đổi</th></tr></TableHead>
        <tbody>{rows.map((row) => <tr key={row.label}><TableCell><span className="font-medium text-slate-900">{row.label}</span></TableCell><TableCell><span className="tabular-nums text-slate-500">{row.before}</span></TableCell><TableCell><span className="font-semibold tabular-nums text-slate-950">{row.after}</span></TableCell><TableCell><span className="inline-flex items-center gap-1 font-semibold text-emerald-700">{row.good === 'up' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}{row.change}</span></TableCell></tr>)}</tbody>
      </DataTable>
      <dl className="grid border-t border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
        <Economic label="Chi phí deadhead" value={formatCurrency(plan.metrics.budget)} />
        <Economic label="Chi phí thưởng" value={formatCurrency(plan.estimatedRewardCost)} />
        <Economic label="Doanh thu tăng thêm" value={formatCurrency(plan.estimatedAdditionalRevenue)} />
        <Economic label="Thưởng ròng sau doanh thu" value={formatCurrency(plan.estimatedNetCost)} strong />
      </dl>
    </Card>
  )
}

function Economic({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return <div className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 tabular-nums ${strong ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>{value}</dd></div>
}
