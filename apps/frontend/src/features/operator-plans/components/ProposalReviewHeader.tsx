import type { ReactNode } from 'react'

import { getProposalCreationLabel, getProposalGeneratorLabel, type Proposal } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { Card } from '@/shared/components/ui/Card'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency, formatOptionalPercentRatio, formatTime } from '@/shared/lib/format'

type Props = { actions: ReactNode; campaignAction?: ReactNode; hasCampaign: boolean; plan: Proposal }

export function ProposalReviewHeader({ actions, campaignAction, hasCampaign, plan }: Props) {
  const passedPolicies = plan.policyChecks.filter((check) => check.passed).length
  return (
    <Card className="nf-proposal-review-header p-0">
      <div className="flex flex-col justify-between gap-4 px-5 py-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone="info">Xếp hạng #{plan.rank}</Badge><Badge tone={plan.generatorType === 'MOCK' || plan.generatorType === 'AGENT' ? 'warning' : 'neutral'}>{getProposalGeneratorLabel(plan.generatorType)}</Badge><StatusBadge status={plan.status} /></div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{plan.title}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{plan.id} · v{plan.version} · {getProposalCreationLabel(plan.generatorType)} {formatTime(plan.createdAt)}</p>
        </div>
        <div className="lg:text-right"><div className="flex flex-wrap justify-end gap-2">{actions}{campaignAction}</div><p className="mt-2 max-w-md text-xs text-slate-500">Phê duyệt khóa phương án. Phát hành offer xác nhận riêng.</p></div>
      </div>
      <ol aria-label="Tiến trình proposal" className="grid border-y border-slate-200 bg-slate-50/70 text-xs sm:grid-cols-4">
        <Step done label="Gợi ý" number="1" />
        <Step done label={plan.simulationAvailable ? 'Mô phỏng' : 'Policy DB'} number="2" />
        <Step done={plan.status === 'Approved' || plan.status === 'Rejected'} current={plan.status === 'UnderReview' || plan.status === 'Revised'} label="Duyệt" number="3" />
        <Step done={hasCampaign} current={plan.status === 'Approved' && !hasCampaign} label="Offer" number="4" />
      </ol>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Khu vực" value={plan.targetZoneId ? plan.targetZoneLabel : 'Chưa xác định'} />
        <Summary label="Mục tiêu" value={`${plan.targetDriverCount} tài xế / ${plan.campaignDurationMinutes} phút`} />
        <Summary label="Tin cậy" value={formatOptionalPercentRatio(plan.confidence)} />
        <Summary label="Policy / quỹ" value={`${passedPolicies}/${plan.policyChecks.length} đạt · ${formatCurrency(plan.budgetLimit)}`} />
      </dl>
    </Card>
  )
}

function Step({ current = false, done = false, label, number }: { current?: boolean; done?: boolean; label: string; number: string }) {
  return <li className={`flex items-center gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${current ? 'bg-brand-50 text-brand-800' : 'text-slate-500'}`}><span className={`grid size-6 place-items-center rounded-full font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>{done ? '✓' : number}</span><span className="font-medium">{label}</span></li>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>
}
