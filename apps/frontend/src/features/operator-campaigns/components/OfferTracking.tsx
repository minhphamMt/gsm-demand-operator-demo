import { useQuery } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { useState } from 'react'

import { getZoneLabel } from '@/features/operator-campaigns/model/zoneLabels'
import type { OfferStatus } from '@/features/operator-data'
import { driversQuery, offersQuery, useOperatorActions } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Dialog } from '@/shared/components/ui/Dialog'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency, formatTime } from '@/shared/lib/format'

import '@/shared/components/layout/operator-activity-pages.css'

type Filter = 'all' | OfferStatus
const filterOptions: readonly { id: Filter; label: string }[] = [{ id: 'all', label: 'Tất cả' }, { id: 'Open', label: 'Đang chờ' }, { id: 'Accepted', label: 'Chấp nhận' }, { id: 'Declined', label: 'Từ chối' }, { id: 'Expired', label: 'Hết hạn' }, { id: 'Cancelled', label: 'Đã hủy' }]

export function OfferTracking({ campaignId }: { campaignId?: string } = {}) {
  const offers = useQuery(offersQuery(campaignId))
  const drivers = useQuery(driversQuery())
  const actions = useOperatorActions()
  const [filter, setFilter] = useState<Filter>('all')
  const [expiring, setExpiring] = useState<string>()

  if (offers.isPending || drivers.isPending) return <Skeleton className="h-72" />
  const retryAll = () => { void offers.refetch(); void drivers.refetch() }
  if ((offers.isError && offers.data === undefined) || (drivers.isError && drivers.data === undefined)) return <ErrorState onRetry={retryAll} />
  if (!offers.data.length) return <div className="space-y-3"><DataRefreshState hasError={offers.isRefetchError || drivers.isRefetchError} isFetching={offers.isFetching || drivers.isFetching} onRetry={retryAll} /><EmptyState title="Chưa có offer nào" description="Offer sẽ xuất hiện sau khi một chiến dịch được phát hành." /></div>

  const driverName = (driverId: string) => drivers.data.find((driver) => driver.id === driverId)?.name ?? driverId
  const visibleOffers = offers.data.filter((offer) => filter === 'all' || offer.status === filter).sort((left, right) => Number(left.status !== 'Open') - Number(right.status !== 'Open'))

  const counts = {
    accepted: offers.data.filter((offer) => offer.status === 'Accepted').length,
    closed: offers.data.filter((offer) => offer.status === 'Declined' || offer.status === 'Expired' || offer.status === 'Cancelled').length,
    open: offers.data.filter((offer) => offer.status === 'Open').length,
    total: offers.data.length,
  }

  return <div className="nf-activity-page nf-offer-page">
    <DataRefreshState hasError={offers.isRefetchError || drivers.isRefetchError} isFetching={offers.isFetching || drivers.isFetching} onRetry={retryAll} />
    <section className="nf-offer-overview">
      <div className="nf-offer-overview-head">
        <div><small>LIVE CONTROL · OFFER</small><h2>Đang theo dõi offer</h2><span>{counts.total} offer · phản hồi và ETA theo thời gian thực</span></div>
        <div className="nf-offer-filters" aria-label="Lọc trạng thái offer">{filterOptions.map((option) => <button className={filter === option.id ? 'is-active' : ''} key={option.id} type="button" onClick={() => setFilter(option.id)}>{option.label}</button>)}</div>
      </div>
      <div className="nf-activity-kpi-grid nf-offer-kpis">
      <div><small>TỔNG OFFER</small><strong>{counts.total}</strong><span>Đang theo dõi</span></div>
      <div className="is-warning"><small>ĐANG CHỜ</small><strong>{counts.open}</strong><span>Chưa có phản hồi</span></div>
      <div className="is-good"><small>ĐÃ NHẬN</small><strong>{counts.accepted}</strong><span>Tài xế chấp nhận</span></div>
      <div><small>ĐÓNG / HẾT HẠN</small><strong>{counts.closed}</strong><span>Không còn hiệu lực</span></div>
      </div>
    </section>
    <Card className="nf-offer-card p-0">
      <div className="nf-offer-card-header">
        <div><small>OFFER MỚI NHẤT</small><h2>Phản hồi tài xế</h2></div>
        <span>{visibleOffers.length} đang hiển thị</span>
      </div>
      {visibleOffers.length ? <div className="nf-offer-list" aria-label="Danh sách offer">{visibleOffers.map((offer) => <article className="nf-offer-row" key={offer.id}>
        <div className="nf-offer-row-driver"><span className="nf-offer-row-status" data-status={offer.status}>{offer.status === 'Accepted' ? '✓' : offer.status === 'Open' ? '·' : '!'}</span><div><strong>{driverName(offer.driverId)}</strong><small>{offer.id} · {offer.campaignId}</small></div></div>
        <div><small>KHU VỰC / ETA</small><strong>{getZoneLabel(offer.targetZoneId)}</strong><span>ETA {offer.etaMinutes} phút · {offer.distanceKm.toFixed(1)} km</span></div>
        <div><small>THƯỞNG</small><strong>{formatCurrency(offer.incentiveAmount)}</strong><span>{formatTime(offer.respondedAt ?? offer.expiresAt)}</span></div>
        <div><StatusBadge status={offer.status} /><span>{offer.responseSource === 'human' ? 'Ứng dụng tài xế' : offer.responseSource === 'simulated' ? 'Mô phỏng hệ thống' : 'Chờ phản hồi'}</span></div>
        <div>{offer.status === 'Open' ? <Button disabled={actions.expireOffer.isPending} variant="danger" onClick={() => setExpiring(offer.id)}><Ban className="size-4" />Hủy offer</Button> : <span className="nf-offer-locked">Đã khóa</span>}</div>
      </article>)}</div> : <div className="border-t border-slate-200 p-5"><EmptyState title="Không có offer phù hợp" description="Hãy chọn trạng thái khác hoặc xóa bộ lọc." /></div>}
    </Card>
    <Dialog isOpen={Boolean(expiring)} onClose={() => setExpiring(undefined)} title="Hủy offer"><p className="text-sm text-slate-600">Offer {expiring} sẽ bị khóa ngay và tài xế không thể phản hồi nữa. Thao tác được ghi vào audit log.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setExpiring(undefined)}>Quay lại</Button><Button variant="danger" isLoading={actions.expireOffer.isPending} onClick={() => { if (expiring) actions.expireOffer.mutate(expiring); setExpiring(undefined) }}>Xác nhận hủy offer</Button></div></Dialog>
    {actions.expireOffer.error && <p className="text-sm text-rose-700" role="alert">{actions.expireOffer.error.message}</p>}
  </div>
}
