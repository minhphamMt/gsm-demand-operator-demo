import { useQuery } from '@tanstack/react-query'
import { Ban, CircleDollarSign, Navigation, RadioTower, Route, Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { CampaignFunnel } from '@/features/operator-campaigns/components/CampaignFunnel'
import { campaignNotice, isCampaignCancellable } from '@/features/operator-campaigns/model/campaignState'
import { getZoneLabel } from '@/features/operator-campaigns/model/zoneLabels'
import { campaignsQuery, useOperatorActions } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Dialog } from '@/shared/components/ui/Dialog'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { MetricStrip } from '@/shared/components/ui/MetricStrip'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency, formatTime } from '@/shared/lib/format'

export function CampaignList() {
  const campaigns = useQuery(campaignsQuery())
  const actions = useOperatorActions()
  const [cancelling, setCancelling] = useState<string>()

  if (campaigns.isPending) return <Skeleton className="h-64" />
  if (campaigns.isError && campaigns.data === undefined) return <ErrorState onRetry={() => void campaigns.refetch()} />
  if (!campaigns.data.length) return <div className="space-y-3"><DataRefreshState hasError={campaigns.isRefetchError} isFetching={campaigns.isFetching} onRetry={() => void campaigns.refetch()} /><EmptyState title="Chưa có campaign" description="Campaign sẽ xuất hiện sau khi operator phát hành một proposal đã duyệt." /></div>

  const totals = campaigns.data.reduce((sum, campaign) => ({ arrived: sum.arrived + campaign.arrivedVerified, budget: sum.budget + campaign.budgetLimit, offers: sum.offers + campaign.offersSent, spent: sum.spent + campaign.incentiveBudget }), { arrived: 0, budget: 0, offers: 0, spent: 0 })

  return (
    <div className="space-y-5">
      <DataRefreshState hasError={campaigns.isRefetchError} isFetching={campaigns.isFetching} onRetry={() => void campaigns.refetch()} />
      <MetricStrip items={[
        { icon: <RadioTower className="size-4" />, label: 'Campaign đang chạy', value: campaigns.data.filter((item) => item.status === 'Active' || item.status === 'Running').length },
        { icon: <Send className="size-4" />, label: 'Offer đã phát hành', value: totals.offers },
        { icon: <Navigation className="size-4" />, label: 'GPS đã xác minh', tone: 'good', value: `${totals.arrived} xe` },
        { detail: `Hạn mức ${formatCurrency(totals.budget)}`, icon: <CircleDollarSign className="size-4" />, label: 'Chi tiêu đã ghi nhận', value: formatCurrency(totals.spent) },
      ]} />
      {campaigns.data.map((campaign) => {
        const budgetRemaining = Math.max(0, campaign.budgetLimit - campaign.incentiveBudget)
        const targetProgress = campaign.suggestedActivation > 0 ? Math.min(100, Math.round((campaign.unitsGained / campaign.suggestedActivation) * 100)) : 0
        const notice = campaignNotice(campaign)
        return (
          <Card className="p-0" key={campaign.id}>
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start">
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">Chiến dịch {campaign.id}</h2><StatusBadge status={campaign.status} /></div><p className="mt-1 text-sm text-slate-500">Proposal {campaign.planId} · {getZoneLabel(campaign.targetZoneId)} · {formatTime(campaign.startedAt)}–{formatTime(campaign.expiresAt)}</p></div>
              {isCampaignCancellable(campaign) && <Button variant="secondary" onClick={() => setCancelling(campaign.id)}><Ban className="size-4" />Dừng chiến dịch</Button>}
            </div>
            <div className="p-5">
              <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chỉ số tiến độ</p><div className="mt-4 flex justify-between text-sm"><span className="font-medium text-slate-700">Mục tiêu xe</span><span className="font-semibold tabular-nums text-slate-950">{campaign.unitsGained}/{campaign.suggestedActivation} · {targetProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand-600" style={{ width: `${targetProgress}%` }} /></div><p className="mt-2 text-xs text-slate-500">Nhận {campaign.accepted} · từ chối {campaign.declined} · hết hạn {campaign.expired}</p><dl className="mt-5 grid grid-cols-2 gap-4"><OperationalMetric icon={<Route className="size-4" />} label="Chuyến đủ điều kiện" value={campaign.qualifiedTrips} /><OperationalMetric icon={<CircleDollarSign className="size-4" />} label="Chi phí ghi nhận" value={formatCurrency(campaign.incentiveBudget)} /><OperationalMetric label="Ngân sách còn" value={formatCurrency(budgetRemaining)} /><OperationalMetric label="Cam kết tối đa" value={formatCurrency(campaign.worstCaseCommitment)} /></dl></div>
                <CampaignFunnel campaign={campaign} />
              </div>
              {notice && <CampaignNotice message={notice.message} tone={notice.tone} />}
            </div>
          </Card>
        )
      })}
      <CancelDialog campaignId={cancelling} isPending={actions.cancelCampaign.isPending} onCancel={() => setCancelling(undefined)} onConfirm={() => { if (cancelling) actions.cancelCampaign.mutate(cancelling); setCancelling(undefined) }} />
      {actions.cancelCampaign.error && <p role="alert" className="text-sm text-rose-700">{actions.cancelCampaign.error.message}</p>}
    </div>
  )
}

function OperationalMetric({ icon, label, value }: { icon?: ReactNode; label: string; value: number | string }) { return <div><dt className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</dt><dd className="mt-1 font-semibold tabular-nums text-slate-950">{value}</dd></div> }

function CampaignNotice({ message, tone }: { message: string; tone: 'neutral' | 'success' | 'warning' }) {
  const classes = tone === 'success' ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : tone === 'warning' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-400 bg-slate-50 text-slate-700'
  return <p className={`mt-4 border-l-4 px-3 py-2 text-sm ${classes}`} role="status">{message}</p>
}

function CancelDialog({ campaignId, isPending, onCancel, onConfirm }: { campaignId: string | undefined; isPending: boolean; onCancel: () => void; onConfirm: () => void }) { return <Dialog isOpen={Boolean(campaignId)} onClose={onCancel} title="Dừng chiến dịch đang chạy"><p className="text-sm text-slate-600">Offer chưa phản hồi sẽ chuyển sang hết hạn. Participation đã nhận nhưng chưa hoàn tất sẽ bị hủy và tài xế được trả về trạng thái sẵn sàng hoặc offline.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Quay lại</Button><Button variant="danger" isLoading={isPending} onClick={onConfirm}>Dừng chiến dịch</Button></div></Dialog> }
