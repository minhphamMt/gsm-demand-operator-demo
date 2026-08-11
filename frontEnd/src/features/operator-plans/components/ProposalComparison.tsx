import { ArrowRight, CheckCircle2, CircleAlert, Trophy } from 'lucide-react'
import { Link } from 'react-router'

import { getProposalGeneratorLabel, type Proposal } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { Card } from '@/shared/components/ui/Card'
import { routes } from '@/shared/config/routes'
import { formatCurrency, formatMultiplier, formatOptionalPercentRatio, formatTime } from '@/shared/lib/format'

export function ProposalComparison({ proposals }: { proposals: readonly Proposal[] }) {
  if (!proposals.length) return null

  return (
    <Card className="mb-5 p-0">
      <div className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">Cùng snapshot đầu vào</p>
          <h2 className="mt-1 font-semibold text-slate-950">Các phương án đang chờ kiểm duyệt</h2>
          <p className="mt-1 text-sm text-slate-500">Nguồn sinh và trạng thái mô phỏng được ghi rõ; xếp hạng chỉ hỗ trợ điều phối viên rà soát.</p>
        </div>
        <p className="text-xs text-slate-500">Ghi nhận gần nhất: {formatTime(proposals[0]!.createdAt)}</p>
      </div>
      <div className="grid gap-4 border-t border-slate-200 p-5 lg:grid-cols-3">
        {proposals.map((proposal) => {
          const policyPassed = proposal.policyChecks.every((check) => check.passed)
          const budgetUsage = proposal.budgetLimit > 0 ? Math.round((proposal.estimatedRewardCost / proposal.budgetLimit) * 100) : null
          return <article className={`flex flex-col rounded-xl border bg-white p-4 ${proposal.rank === 1 ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`} key={proposal.id}>
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Proposal #{proposal.rank}</span>{proposal.rank === 1 && <Trophy className="size-4 text-amber-500" />}</div><h3 className="mt-1 font-semibold text-slate-950">{proposal.title.split('—')[0]}</h3><p className="mt-1 font-mono text-xs text-slate-500">{proposal.id} · v{proposal.version}</p><p className="mt-1 text-xs font-medium text-slate-600">{getProposalGeneratorLabel(proposal.generatorType)}</p></div><Badge tone={proposal.rank === 1 ? 'info' : 'neutral'}>{formatOptionalPercentRatio(proposal.confidence)}</Badge></div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><Metric label="Mục tiêu tài xế" value={`${proposal.targetDriverCount} xe`} /><Metric label="Hệ số giá khách" value={formatMultiplier(proposal.fareMultiplier)} /><Metric label="Gap còn lại" value={`${proposal.metrics.residualGap} xe`} /><Metric label="Thưởng ròng" value={formatCurrency(proposal.estimatedNetCost)} /></dl>
            <div className="mt-4"><div className="flex justify-between text-xs"><span className="text-slate-500">Sử dụng ngân sách</span><span className="font-semibold text-slate-900">{budgetUsage === null ? 'Chưa có' : `${budgetUsage}%`}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, budgetUsage ?? 0)}%` }} /></div><p className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${policyPassed ? 'text-emerald-700' : 'text-rose-700'}`}>{policyPassed ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}{policyPassed ? 'Đạt toàn bộ policy' : 'Có cảnh báo cần xử lý'}</p></div>
            <Link className={`mt-4 inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-semibold ${proposal.rank === 1 ? 'bg-brand-600 text-white hover:bg-brand-500' : 'border border-slate-300 text-slate-700 hover:border-brand-500 hover:text-brand-700'}`} to={routes.operator.planDetail(proposal.id)}>Kiểm duyệt <ArrowRight className="size-4" /></Link>
          </article>
        })}
      </div>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div> }
