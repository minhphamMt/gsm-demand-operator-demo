import { useQuery } from '@tanstack/react-query'
import { CircleDollarSign, FileCheck2, Route, WalletCards } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { campaignsQuery, operationsReportQuery, plansQuery } from '@/features/operator-data'
import type { OperationsCampaignReport, OperationsReport } from '@/features/operator-data'
import { ReportCampaignChart } from '@/features/operator-reports/components/ReportCampaignChart'
import { ScenarioComparison } from '@/features/operator-reports/components/ScenarioComparison'
import { hasInvalidReportRange, reportFilterState, toOperationsReportFilters } from '@/features/operator-reports/model/reportFilters'
import { Card } from '@/shared/components/ui/Card'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { Input, Select } from '@/shared/components/ui/Field'
import { MetricStrip } from '@/shared/components/ui/MetricStrip'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency, formatTime } from '@/shared/lib/format'

export function Reports() {
  const [search, setSearch] = useSearchParams()
  const filters = reportFilterState(search)
  const isInvalidRange = hasInvalidReportRange(filters)
  const report = useQuery({ ...operationsReportQuery(toOperationsReportFilters(filters)), enabled: !isInvalidRange })
  const campaigns = useQuery(campaignsQuery())
  const plans = useQuery(plansQuery())
  const setFilter = (key: 'campaignId' | 'from' | 'to', value: string) => setSearch((current) => {
    const next = new URLSearchParams(current)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    return next
  }, { replace: true })

  if (isInvalidRange) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.</div>
  if (report.isPending || campaigns.isPending || plans.isPending) return <Skeleton className="h-96" />
  const retryAll = () => { void report.refetch(); void campaigns.refetch(); void plans.refetch() }
  if ((report.isError && report.data === undefined) || (campaigns.isError && campaigns.data === undefined) || (plans.isError && plans.data === undefined)) return <ErrorState onRetry={retryAll} />

  return <div className="nf-workspace-stack">
    <DataRefreshState hasError={report.isRefetchError || campaigns.isRefetchError} isFetching={report.isFetching || campaigns.isFetching} onRetry={retryAll} />
    <div className="nf-workspace-command-grid">
      <ReportFilters campaignId={filters.campaignId} campaigns={campaigns.data.map((campaign) => campaign.id)} fromDate={filters.fromDate} onChange={setFilter} toDate={filters.toDate} />
      <ScenarioComparison plans={plans.data} />
    </div>
    <ReportSummary report={report.data} />
    <BudgetLifecycle report={report.data} />
    {report.data.campaigns.length ? <>
      <Card className="nf-workspace-panel"><div className="mb-3"><h2 className="font-semibold text-slate-950">Kết quả ghi trong DB theo campaign</h2><p className="mt-1 text-sm text-slate-500">Chỉ hiển thị tài xế kích hoạt và chuyến hoàn tất có bản ghi nguồn.</p></div><ReportCampaignChart campaigns={report.data.campaigns} /></Card>
      <details className="nf-disclosure"><summary>Xem bảng đối soát chi tiết</summary><CampaignReportTable campaigns={report.data.campaigns} /></details>
    </> : <EmptyState description="Không có campaign nào trong bộ lọc phía server." title="Không có dữ liệu báo cáo" />}
    <details className="nf-disclosure"><summary>Nguồn dữ liệu & giới hạn</summary><ReportProvenance report={report.data} /></details>
  </div>
}

function ReportFilters({ campaignId, campaigns, fromDate, onChange, toDate }: { campaignId: string; campaigns: readonly string[]; fromDate: string; onChange: (key: 'campaignId' | 'from' | 'to', value: string) => void; toDate: string }) {
  return <Card className="nf-workspace-panel grid gap-3 sm:grid-cols-3"><div><label className="text-xs font-semibold text-slate-600" htmlFor="report-campaign">Campaign</label><Select className="w-full" id="report-campaign" onChange={(event) => onChange('campaignId', event.target.value)} value={campaignId}><option value="all">Tất cả campaign</option>{campaigns.map((id) => <option key={id} value={id}>{id}</option>)}</Select></div><div><label className="text-xs font-semibold text-slate-600" htmlFor="report-from">Từ ngày</label><Input id="report-from" onChange={(event) => onChange('from', event.target.value)} type="date" value={fromDate} /></div><div><label className="text-xs font-semibold text-slate-600" htmlFor="report-to">Đến ngày</label><Input id="report-to" onChange={(event) => onChange('to', event.target.value)} type="date" value={toDate} /></div></Card>
}

function ReportSummary({ report }: { report: OperationsReport }) {
  const summary = report.summary
  return <section className="nf-workspace-stack" aria-label="Tổng quan báo cáo"><div className="nf-quick-facts">
    <span>Cập nhật <b>{formatTime(report.generatedAt)}</b></span>
    <span><b>{report.dataMode === 'DB_LEDGER' ? 'Dữ liệu DB' : 'Mô phỏng'}</b></span>
    <span><b>{summary.campaigns}</b> campaign</span>
  </div><MetricStrip items={[
    { icon: <Route className="size-4" />, label: 'Tài xế kích hoạt', value: summary.activatedDrivers },
    { icon: <FileCheck2 className="size-4" />, label: 'Chuyến hoàn tất', value: summary.qualifiedTrips },
    { icon: <WalletCards className="size-4" />, label: 'Thưởng mô phỏng đã trả', value: formatCurrency(summary.rewardPaidVnd) },
    { detail: `${summary.campaigns} campaign`, icon: <CircleDollarSign className="size-4" />, label: 'Ngân sách đã dùng', value: formatCurrency(summary.budgetUsedVnd) },
  ]} /></section>
}

function BudgetLifecycle({ report }: { report: OperationsReport }) {
  const summary = report.summary
  return <Card className="nf-workspace-panel"><h2 className="font-semibold text-slate-950">Dòng tiền</h2><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
    {[
      ['Đã giữ chỗ', summary.reservedVnd], ['Đã cam kết', summary.committedVnd],
      ['Đủ điều kiện', summary.qualifiedVnd], ['Đã trả', summary.paidVnd],
      ['Bồi thường chờ trả', summary.compensationDueVnd], ['Đã hoàn', summary.releasedVnd],
    ].map(([label, amount]) => <div className="rounded-lg bg-slate-50 p-3" key={String(label)}><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block">{formatCurrency(Number(amount))}</strong></div>)}
  </div></Card>
}

function CampaignReportTable({ campaigns }: { campaigns: readonly OperationsCampaignReport[] }) {
  return <Card className="nf-workspace-panel overflow-hidden p-0"><div className="px-5 py-4"><h2 className="font-semibold text-slate-950">Đối soát chiến dịch</h2><p className="mt-1 text-sm text-slate-500">Chênh lệch = ngân sách chiến dịch − sổ thưởng đủ điều kiện.</p></div><DataTable label="Đối soát chiến dịch từ DB"><TableHead><tr><th className="px-3 py-3">Chiến dịch</th><th className="px-3 py-3">Kích hoạt / chuyến</th><th className="px-3 py-3">Sổ thưởng</th><th className="px-3 py-3">Ngân sách</th><th className="px-3 py-3">Chênh lệch</th><th className="px-3 py-3">Audit</th></tr></TableHead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><TableCell><span className="block font-mono text-xs font-semibold">{campaign.id}</span><span className="mt-1 block"><StatusBadge status={campaign.status} /></span></TableCell><TableCell>{campaign.activatedDrivers} xe / {campaign.qualifiedTrips} chuyến</TableCell><TableCell>{formatCurrency(campaign.rewardQualifiedVnd)}<span className="block text-xs text-slate-500">đã trả mô phỏng {formatCurrency(campaign.rewardPaidVnd)}</span></TableCell><TableCell>{formatCurrency(campaign.budgetUsedVnd)}<span className="block text-xs text-slate-500">hạn mức {formatCurrency(campaign.budgetLimitVnd)}</span></TableCell><TableCell className={campaign.rewardBudgetDeltaVnd === 0 ? 'text-emerald-700' : 'text-amber-700'}>{formatCurrency(campaign.rewardBudgetDeltaVnd)}</TableCell><TableCell>{campaign.auditEvents}</TableCell></tr>)}</tbody></DataTable></Card>
}

function ReportProvenance({ report }: { report: OperationsReport }) {
  return <Card className="nf-workspace-panel"><h2 className="font-semibold text-slate-950">Nguồn và giới hạn báo cáo</h2><dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><Source label="Tài xế kích hoạt" value={report.sources.activatedDrivers} /><Source label="Chuyến đủ điều kiện" value={report.sources.qualifiedTrips} /><Source label="Thưởng đủ điều kiện" value={report.sources.rewardQualifiedVnd} /><Source label="Thưởng đã trả" value={report.sources.rewardPaidVnd} /><Source label="Ngân sách" value={report.sources.budgetUsedVnd} /><Source label="Audit" value={report.sources.auditEvents} /></dl><p className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">Chi phí ròng chưa khả dụng vì DB chưa có sổ doanh thu tăng thêm. Báo cáo không suy diễn hoặc gắn nhãn “đã ghi nhận” cho chỉ số này.</p></Card>
}

function Source({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 border-b border-slate-100 py-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-mono text-xs text-slate-800">{value}</dd></div> }
