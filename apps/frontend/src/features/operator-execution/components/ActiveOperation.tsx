import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { activeExecutionPlan, campaignsQuery, dispatchQuery, plansQuery, useOperatorActions } from '@/features/operator-data'
import { EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { routes } from '@/shared/config/routes'
import { CampaignOperation } from '@/features/operator-execution/components/CampaignOperation'
import { DispatchOperation } from '@/features/operator-execution/components/DispatchOperation'
import { StopOperationDialog } from '@/features/operator-execution/components/StopOperationDialog'
import { useState } from 'react'
import './operator-execution.css'

type StopTarget = { id: string; kind: 'dispatch' | 'campaign' } | null

export function ActiveOperation() {
  const plans = useQuery(plansQuery())
  const campaigns = useQuery(campaignsQuery())
  const dispatches = useQuery(dispatchQuery())
  const actions = useOperatorActions()
  const [stopTarget, setStopTarget] = useState<StopTarget>(null)
  const execution = activeExecutionPlan(plans.data, campaigns.data, dispatches.data)
  const isLoading = plans.isPending || campaigns.isPending || dispatches.isPending
  const hasError = plans.isError || campaigns.isError || dispatches.isError
  const refresh = () => { void Promise.all([plans.refetch(), campaigns.refetch(), dispatches.refetch()]) }
  const stopError = actions.cancelDispatch.error?.message ?? actions.cancelCampaign.error?.message
  const isStopping = actions.cancelDispatch.isPending || actions.cancelCampaign.isPending
  const stop = (reason: string) => {
    if (!stopTarget) return
    if (stopTarget.kind === 'dispatch') actions.cancelDispatch.mutate({ batchId: stopTarget.id, reason }, { onSuccess: () => setStopTarget(null) })
    else actions.cancelCampaign.mutate(stopTarget.id, { onSuccess: () => setStopTarget(null) })
  }

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-80" /></div>
  if (hasError) return <ErrorState onRetry={refresh} />
  if (!execution) return <div className="nf-operation-empty-page"><EmptyState description="Khi một phương án được áp dụng, tiến độ và thao tác vận hành sẽ xuất hiện tại đây." title="Không có phương án đang vận hành" /><Link className="btn btn-primary" to={routes.operator.root}><ArrowLeft size={15} />Về trang điều hành</Link></div>

  return <>
    <div className="nf-operation-context"><Activity size={17} /><span>Chỉ có một phương án được vận hành tại một thời điểm.</span><b>{execution.plan ? `v${execution.plan.version} · ${execution.plan.title}` : execution.planId.slice(0, 12)}</b></div>
    {execution.dispatch && <DispatchOperation batch={execution.dispatch} isRefreshing={dispatches.isFetching} isRetrying={actions.retryDispatch.isPending} onRefresh={refresh} onRetry={(batchId, moveId) => actions.retryDispatch.mutate({ batchId, moveId, reason: 'Điều phối viên thử lại từ trang phương án đang vận hành.' })} onStop={() => setStopTarget({ id: execution.dispatch!.id, kind: 'dispatch' })} plan={execution.plan} />}
    {execution.campaign && <CampaignOperation campaign={execution.campaign} isRefreshing={campaigns.isFetching} onRefresh={refresh} onStop={() => setStopTarget({ id: execution.campaign!.id, kind: 'campaign' })} plan={execution.plan} />}
    <StopOperationDialog error={stopError} isOpen={stopTarget !== null} isSaving={isStopping} onClose={() => setStopTarget(null)} onConfirm={stop} title={stopTarget?.kind === 'campaign' ? 'Hủy offer đang phát hành?' : 'Dừng phương án đang vận hành?'} />
  </>
}
