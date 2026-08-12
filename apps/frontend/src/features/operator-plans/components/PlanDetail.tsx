import { useQuery } from '@tanstack/react-query'
import { CircleCheckBig } from 'lucide-react'
import { useNavigate } from 'react-router'

import { auditQuery, campaignsQuery, isCampaignOperational, planQuery, plansQuery, useOperatorActions } from '@/features/operator-data'
import { PlanAuditTrail } from '@/features/operator-plans/components/PlanAuditTrail'
import { PlanDecisionActions } from '@/features/operator-plans/components/PlanDecisionActions'
import { ProposalEvidence } from '@/features/operator-plans/components/ProposalEvidence'
import { ProposalReviewForm } from '@/features/operator-plans/components/ProposalReviewForm'
import { ProposalReviewHeader } from '@/features/operator-plans/components/ProposalReviewHeader'
import { SimulationComparison } from '@/features/operator-plans/components/SimulationComparison'
import { Card } from '@/shared/components/ui/Card'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { routes } from '@/shared/config/routes'
import { AppError } from '@/shared/api/client'

function actionErrorMessage(errors: readonly (Error | null)[]) {
  const error = errors.find(Boolean)
  if (!error) return undefined
  return `${error.message}${error instanceof AppError && error.requestId ? ` Mã yêu cầu: ${error.requestId}.` : ''}`
}

export function PlanDetail({ planId }: { planId: string }) {
  const plan = useQuery(planQuery(planId))
  const plans = useQuery(plansQuery())
  const audit = useQuery(auditQuery())
  const campaigns = useQuery(campaignsQuery())
  const actions = useOperatorActions()
  const navigate = useNavigate()
  const decisionError = actionErrorMessage([actions.approve.error, actions.reject.error, actions.activate.error])

  const queries = [plan, plans, audit, campaigns]
  const retryAll = () => { for (const query of queries) void query.refetch() }
  if (queries.some((query) => query.isPending)) return <Skeleton className="h-96" />
  if (queries.some((query) => query.isError && query.data === undefined)) return <ErrorState onRetry={retryAll} />
  if (!plan.data) return <EmptyState title="Không tìm thấy phương án" description="Phương án không còn tồn tại hoặc bạn không có quyền truy cập." />

  const proposal = plan.data
  const versionIds = new Set(plans.data?.filter((version) => version.rootProposalId === proposal.rootProposalId).map((version) => version.id) ?? [proposal.id])
  const history = audit.data?.filter((entry) => versionIds.has(entry.planId)) ?? []
  const linkedCampaign = campaigns.data?.find((campaign) => campaign.planId === proposal.id)
  const hasOperationalCampaign = Boolean(linkedCampaign && isCampaignOperational(linkedCampaign))
  const decisionActions = <PlanDecisionActions plan={proposal} campaignStatus={linkedCampaign?.status} hasOperationalCampaign={hasOperationalCampaign} error={decisionError} isWorking={actions.approve.isPending || actions.reject.isPending || actions.activate.isPending} onApprove={(note) => actions.approve.mutate({ planId: proposal.id, note })} onReject={(request) => actions.reject.mutate({ planId: proposal.id, request })} onActivate={() => actions.activate.mutate({ planId: proposal.id, mode: 'human' }, { onSuccess: () => navigate(routes.operator.campaigns) })} />

  return <div className="space-y-5">
    <DataRefreshState hasError={queries.some((query) => query.isRefetchError)} isFetching={queries.some((query) => query.isFetching)} onRetry={retryAll} />
    <ProposalReviewHeader plan={proposal} hasCampaign={Boolean(linkedCampaign)} actions={decisionActions} />
    {proposal.status === 'Approved' && !linkedCampaign && <Card className="border-emerald-200 bg-emerald-50"><div className="flex gap-3"><CircleCheckBig className="size-5 shrink-0 text-emerald-700" /><div><h3 className="font-semibold text-emerald-950">Proposal đã được khóa và phê duyệt</h3><p className="mt-1 text-sm text-emerald-800">Chưa có offer nào được gửi tự động. Điều phối viên phải xác nhận riêng “Thiết lập huy động thêm” nếu muốn xử lý residual gap.</p></div></div></Card>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5"><SimulationComparison plan={proposal} /><ProposalReviewForm plan={proposal} error={actions.revise.error} isSaving={actions.revise.isPending} onRevise={(request) => actions.revise.mutate({ planId: proposal.id, request }, { onSuccess: (revised) => navigate(routes.operator.planDetail(revised.id), { replace: true }) })} /></div>
      <div className="space-y-5"><ProposalEvidence plan={proposal} /><PlanAuditTrail entries={history} /></div>
    </div>
  </div>
}
