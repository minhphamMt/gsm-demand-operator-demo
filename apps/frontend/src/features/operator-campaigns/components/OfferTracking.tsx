import { useQuery } from '@tanstack/react-query'
import { Clock3 } from 'lucide-react'
import { useState } from 'react'

import { getZoneLabel } from '@/features/operator-campaigns/model/zoneLabels'
import type { OfferStatus } from '@/features/operator-data'
import { driversQuery, offersQuery, useOperatorActions } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'
import { Dialog } from '@/shared/components/ui/Dialog'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency, formatTime } from '@/shared/lib/format'

type Filter = 'all' | OfferStatus
const filterOptions: readonly { id: Filter; label: string }[] = [{ id: 'all', label: 'Tất cả' }, { id: 'Open', label: 'Đang chờ' }, { id: 'Accepted', label: 'Chấp nhận' }, { id: 'Declined', label: 'Từ chối' }, { id: 'Expired', label: 'Hết hạn' }]

export function OfferTracking() {
  const offers = useQuery(offersQuery())
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

  return <>
    <DataRefreshState hasError={offers.isRefetchError || drivers.isRefetchError} isFetching={offers.isFetching || drivers.isFetching} onRetry={retryAll} />
    <Card className="p-0">
      <div className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-end">
        <div><h2 className="font-semibold text-slate-950">Quản lý Offer</h2><p className="mt-1 text-sm text-slate-500">Trạng thái gửi, phản hồi và ETA đến vùng của từng tài xế.</p></div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1" aria-label="Lọc trạng thái offer">{filterOptions.map((option) => <button className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === option.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`} key={option.id} type="button" onClick={() => setFilter(option.id)}>{option.label}</button>)}</div>
      </div>
      {visibleOffers.length ? <DataTable label="Danh sách offer">
        <TableHead><tr><th className="px-3 py-3">Offer / campaign</th><th className="px-3 py-3">Tài xế</th><th className="px-3 py-3">Vùng đích / ETA</th><th className="px-3 py-3">Thưởng</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Cập nhật</th><th className="px-3 py-3">Kênh</th><th className="px-3 py-3">Thao tác</th></tr></TableHead>
        <tbody>{visibleOffers.map((offer) => <tr className="hover:bg-slate-50/70" key={offer.id}><TableCell><span className="font-mono text-xs font-semibold text-slate-900">{offer.id}</span><span className="block text-xs text-slate-500">{offer.campaignId}</span></TableCell><TableCell><span className="font-medium text-slate-900">{driverName(offer.driverId)}</span><span className="block font-mono text-xs text-slate-500">{offer.driverId}</span></TableCell><TableCell>{getZoneLabel(offer.targetZoneId)}<span className="block text-xs text-slate-500">ETA {offer.etaMinutes} phút · {offer.distanceKm.toFixed(1)} km</span></TableCell><TableCell>{formatCurrency(offer.incentiveAmount)}</TableCell><TableCell><StatusBadge status={offer.status} /></TableCell><TableCell>{formatTime(offer.respondedAt ?? offer.expiresAt)}</TableCell><TableCell>{offer.responseSource === 'human' ? 'Ứng dụng tài xế' : offer.responseSource === 'simulated' ? 'Mô phỏng hệ thống' : 'Chờ phản hồi'}</TableCell><TableCell>{offer.status === 'Open' ? <Button disabled={actions.expireOffer.isPending} variant="ghost" onClick={() => setExpiring(offer.id)}><Clock3 className="size-4" />Cho hết hạn</Button> : <span className="text-xs text-slate-400">Đã khóa</span>}</TableCell></tr>)}</tbody>
      </DataTable> : <div className="border-t border-slate-200 p-5"><EmptyState title="Không có offer phù hợp" description="Hãy chọn trạng thái khác hoặc xóa bộ lọc." /></div>}
    </Card>
    <Dialog isOpen={Boolean(expiring)} onClose={() => setExpiring(undefined)} title="Cho offer hết hạn"><p className="text-sm text-slate-600">Offer {expiring} sẽ không thể được tài xế phản hồi sau thao tác này. Quyết định được ghi vào audit log.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setExpiring(undefined)}>Quay lại</Button><Button variant="danger" isLoading={actions.expireOffer.isPending} onClick={() => { if (expiring) actions.expireOffer.mutate(expiring); setExpiring(undefined) }}>Xác nhận hết hạn</Button></div></Dialog>
    {actions.expireOffer.error && <p className="text-sm text-rose-700" role="alert">{actions.expireOffer.error.message}</p>}
  </>
}
