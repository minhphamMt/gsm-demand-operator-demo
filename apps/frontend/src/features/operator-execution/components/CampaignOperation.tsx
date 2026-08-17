import { RefreshCw, Square, Users } from 'lucide-react'
import { Link } from 'react-router'

import { isCampaignOverdue } from '@/features/operator-data'
import type { Campaign, Proposal } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { routes } from '@/shared/config/routes'
import { formatCurrency, formatTime } from '@/shared/lib/format'

export function CampaignOperation({ campaign, isRefreshing, onRefresh, onStop, plan }: { campaign: Campaign; isRefreshing: boolean; onRefresh: () => void; onStop: () => void; plan: Proposal | undefined }) {
  const target = Math.max(1, campaign.suggestedActivation)
  const progress = Math.min(100, Math.round(campaign.unitsGained / target * 100))
  const overdue = isCampaignOverdue(campaign)
  return <div className="nf-operation-stack">
    {overdue && <div className="nf-operation-alert is-warning" role="alert"><span className="nf-operation-alert-icon">!</span><div><strong>Offer đã quá thời hạn</strong><span>Campaign chưa hoàn tất dù đã tới hạn {formatTime(campaign.expiresAt)}. Hãy kiểm tra phản hồi hoặc hủy offer.</span></div></div>}
    <section className="nf-operation-overview"><div className={overdue ? 'is-overdue' : 'is-status'}><small>TRẠNG THÁI</small><strong className="is-live">{overdue ? 'Cần xử lý' : 'Đang kích hoạt'}</strong><span>Từ {formatTime(campaign.startedAt)}</span></div><div><small>PHẢN HỒI</small><strong>{campaign.accepted}/{campaign.offersSent}</strong><span>{campaign.viewed} đã xem</span></div><div><small>ĐANG ĐẾN</small><strong>{campaign.enRoute}</strong><span>{campaign.arrivedVerified} đã đến</span></div><div><small>NGÂN SÁCH TỐI ĐA</small><strong>{formatCurrency(campaign.worstCaseCommitment)}</strong><span>Giới hạn {formatCurrency(campaign.budgetLimit)}</span></div></section>
    <div className={`nf-operation-progress${overdue ? ' is-overdue' : ''}`}><span style={{ width: `${progress}%` }} /><b>{campaign.unitsGained}/{target} xe đã bổ sung</b></div>
    <div className="nf-operation-toolbar"><div><strong>{plan?.title ?? 'Phương án kích hoạt'}</strong><span>Hết hạn {formatTime(campaign.expiresAt)}</span></div><div><Link className="btn btn-secondary" to={routes.operator.executionOffers(campaign.id)}>Xem offer</Link><Button onClick={onRefresh} variant="secondary"><RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={15} />Cập nhật</Button><Button onClick={onStop} variant="danger"><Square size={14} />Hủy offer</Button></div></div>
    <section className="nf-operation-panel"><header><div><small>PHỄU KÍCH HOẠT</small><h2>Phản hồi tài xế</h2></div><Users size={20} /></header><div className="nf-operation-reconcile"><span>Đã gửi <b>{campaign.offersSent}</b></span><span>Đã xem <b>{campaign.viewed}</b></span><span>Chấp nhận <b>{campaign.accepted}</b></span><span>Từ chối / hết hạn <b>{campaign.declined + campaign.expired}</b></span></div></section>
  </div>
}
