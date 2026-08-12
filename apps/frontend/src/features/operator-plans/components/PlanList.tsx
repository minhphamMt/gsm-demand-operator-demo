import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Clock3, FilePenLine, TimerOff } from 'lucide-react'
import { Link } from 'react-router'
import { useState } from 'react'

import { plansQuery, type Proposal } from '@/features/operator-data'
import { ProposalComparison } from '@/features/operator-plans/components/ProposalComparison'
import { Card } from '@/shared/components/ui/Card'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { Select } from '@/shared/components/ui/Field'
import { MetricStrip } from '@/shared/components/ui/MetricStrip'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { routes } from '@/shared/config/routes'
import { formatTime } from '@/shared/lib/format'

export function PlanList() {
  const [status, setStatus] = useState('all')
  const plans = useQuery(plansQuery())

  if (plans.isPending) return <div className="space-y-3">{['1', '2', '3'].map((id) => <Skeleton key={id} className="h-32" />)}</div>
  if (plans.isError && plans.data === undefined) return <ErrorState onRetry={() => void plans.refetch()} />
  if (!plans.data.length) return <div className="space-y-3"><DataRefreshState hasError={plans.isRefetchError} isFetching={plans.isFetching} onRetry={() => void plans.refetch()} /><EmptyState title="Chưa có proposal" description="Hệ thống chưa ghi nhận proposal nào để operator kiểm duyệt." /></div>

  const count = (states: readonly string[]) => plans.data.filter((plan) => states.includes(plan.status)).length
  const reviewProposals = plans.data.filter((plan) => plan.status === 'UnderReview' || plan.status === 'Revised').slice(0, 3)
  const visiblePlans = plans.data.filter((plan) => status === 'all' || plan.status === status)

  return (
    <div className="space-y-5">
      <DataRefreshState hasError={plans.isRefetchError} isFetching={plans.isFetching} onRetry={() => void plans.refetch()} />
      <MetricStrip items={[
        { icon: <Clock3 className="size-4" />, label: 'Chờ kiểm duyệt', value: count(['UnderReview']) },
        { icon: <FilePenLine className="size-4" />, label: 'Đã chỉnh sửa', value: count(['Revised']) },
        { icon: <CheckCircle2 className="size-4" />, label: 'Đã phê duyệt', tone: 'good', value: count(['Approved']) },
        { icon: <TimerOff className="size-4" />, label: 'Hết hiệu lực', value: count(['Stale']) },
      ]} />
      <ProposalComparison proposals={reviewProposals} />
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-semibold text-slate-950">Toàn bộ phiên bản proposal</h2>
            <p className="mt-1 text-sm text-slate-500">Tra cứu phương án hiện hành, phiên bản đã quyết định và proposal hết hiệu lực.</p>
          </div>
          <Select aria-label="Lọc trạng thái phương án" className="mt-0 w-full sm:w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="UnderReview">Chờ kiểm duyệt</option>
            <option value="Revised">Đã chỉnh sửa</option>
            <option value="Approved">Đã duyệt</option>
            <option value="Rejected">Đã từ chối</option>
            <option value="Stale">Hết hiệu lực</option>
          </Select>
        </div>
        {visiblePlans.length ? <>
          <div className="grid gap-3 border-t border-slate-200 p-4 sm:hidden">
            {visiblePlans.map((plan) => <article className="rounded-xl border border-slate-200 p-4" key={plan.id}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-slate-950">{plan.title}</h3><p className="mt-1 truncate font-mono text-xs text-slate-500">{plan.id} · v{plan.version}</p></div><StatusBadge status={plan.status} /></div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Vùng mục tiêu</dt><dd className="mt-1 font-medium text-slate-900">{displayTargetZone(plan)}</dd></div><div><dt className="text-xs text-slate-500">Mô phỏng</dt><dd className="mt-1 font-medium text-slate-900">{simulationSummary(plan)}</dd></div></dl>
              <Link className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white" to={routes.operator.planDetail(plan.id)}>Xem hồ sơ <ArrowRight className="size-4" /></Link>
            </article>)}
          </div>
          <div className="hidden sm:block"><DataTable label="Toàn bộ phiên bản proposal">
          <TableHead><tr><th className="px-3 py-3">Proposal</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Khởi tạo</th><th className="px-3 py-3">Vùng mục tiêu</th><th className="px-3 py-3">Kỳ vọng</th><th className="px-3 py-3"><span className="sr-only">Thao tác</span></th></tr></TableHead>
          <tbody>
            {visiblePlans.map((plan) => (
              <tr className="hover:bg-slate-50/70" key={plan.id}>
                <TableCell><span className="font-semibold text-slate-950">{plan.title}</span><span className="mt-1 block font-mono text-xs text-slate-500">{plan.id} · v{plan.version}</span></TableCell>
                <TableCell><StatusBadge status={plan.status} /></TableCell>
                <TableCell>{formatTime(plan.createdAt)}</TableCell>
                <TableCell>{displayTargetZone(plan)}</TableCell>
                <TableCell>{plan.simulationAvailable ? <><span className="font-semibold text-slate-900">{plan.metrics.fulfillmentRate}% đáp ứng</span><span className="block text-xs text-slate-500">gap {plan.metrics.residualGap} xe</span></> : <span className="text-sm text-slate-500">Chưa có mô phỏng</span>}</TableCell>
                <TableCell><Link className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-brand-700 hover:text-brand-500" to={routes.operator.planDetail(plan.id)}>Xem hồ sơ <ArrowRight className="size-4" /></Link></TableCell>
              </tr>
            ))}
          </tbody>
        </DataTable></div></> : <div className="border-t border-slate-200 p-5"><EmptyState title="Không có proposal phù hợp" description="Hãy chọn trạng thái khác hoặc xóa bộ lọc." /></div>}
      </Card>
    </div>
  )
}

function displayTargetZone(plan: Proposal) {
  return plan.targetZoneId ? plan.targetZoneLabel : 'Chưa xác định'
}

function simulationSummary(plan: Proposal) {
  return plan.simulationAvailable ? `${plan.metrics.fulfillmentRate}% · gap ${plan.metrics.residualGap}` : 'Chưa có dữ liệu'
}
