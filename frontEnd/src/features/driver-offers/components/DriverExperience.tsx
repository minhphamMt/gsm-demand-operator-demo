import { useQuery } from '@tanstack/react-query'
import { CarFront, Clock3, Gift, MapPin, Navigation } from 'lucide-react'
import type { ReactNode } from 'react'

import { driverViewQuery, useDriverActions } from '@/features/operator-data'
import { getAiZoneLabel } from '@/features/operator-data/model/aiZoneCatalog'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { StatusBadge } from '@/shared/components/ui/StatusBadge'
import { formatCurrency } from '@/shared/lib/format'

export function DriverExperience({ driverId = 'DRV-001', onSignOut }: { driverId?: string; onSignOut?: () => void }) {
  const view = useQuery(driverViewQuery(driverId))
  const actions = useDriverActions()

  if (view.isPending) return <div className="mx-auto max-w-md p-4"><Skeleton className="h-96" /></div>
  if (view.isError) return <div className="mx-auto max-w-md p-4"><ErrorState onRetry={() => void view.refetch()} /></div>
  if (!view.data) return <EmptyState title="Không tìm thấy tài khoản" description="Vui lòng đăng nhập lại để tiếp tục." />

  const { driver } = view.data
  return <main className="mx-auto min-h-screen max-w-md bg-slate-50 p-4 text-slate-950">
    <header className="mb-5 rounded-panel bg-slate-950 p-5 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">GSM Driver</p><h1 className="mt-2 text-xl font-semibold">Chào {driver.name}</h1></div>{onSignOut && <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={onSignOut}>Đăng xuất</Button>}</div><p className="mt-1 text-sm text-slate-300">Bạn luôn có quyền từ chối lời mời và không bị ảnh hưởng quyền lợi.</p></header>
    <Card><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-slate-950">Trạng thái hoạt động</p><p className="mt-1 text-xs text-slate-500">Mã tài xế {driver.id}</p></div><Button variant="secondary" isLoading={actions.status.isPending} onClick={() => actions.status.mutate({ driverId: driver.id, status: driver.status === 'offline' ? 'online_idle' : 'offline' })}>{driver.status === 'offline' ? 'Đang offline' : driver.status === 'online_idle' ? 'Đang sẵn sàng' : 'Đang tới vùng'}</Button></div></Card>
    <section className="mt-5 space-y-4" aria-label="Lời mời đang mở">{view.data.activeOffers.length ? view.data.activeOffers.map((offer) => <Card key={offer.id} className="border-brand-500/40 bg-brand-50"><Badge tone="success">Lời mời mới</Badge><h2 className="mt-3 text-xl font-semibold">Di chuyển tới {getAiZoneLabel(offer.targetZoneId)}</h2><p className="mt-2 text-sm text-slate-600">{offer.reasonText}</p><p className="mt-4 text-3xl font-bold text-brand-600">{formatCurrency(offer.incentiveAmount)}</p><p className="text-sm text-slate-600">Mức thưởng được giữ nguyên sau khi bạn nhận.</p><dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><DriverMetric icon={<MapPin />} label="Khoảng cách" value={`${offer.distanceKm} km`} /><DriverMetric icon={<CarFront />} label="ETA" value={`${offer.etaMinutes} phút`} /><DriverMetric icon={<Clock3 />} label="Phản hồi trước" value="12 phút" /></dl><div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" disabled={actions.respond.isPending} onClick={() => actions.respond.mutate({ offerId: offer.id, response: 'Declined' })}>Từ chối</Button><Button isLoading={actions.respond.isPending} onClick={() => actions.respond.mutate({ offerId: offer.id, response: 'Accepted' })}>Nhận lời mời</Button></div></Card>) : <EmptyState title="Hiện chưa có lời mời nào" description="Bạn có thể tiếp tục hoạt động bình thường; lời mời mới sẽ xuất hiện tại đây." />}</section>
    {actions.respond.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actions.respond.error.message}</p>}
    <section className="mt-5"><h2 className="mb-3 font-semibold">Lộ trình đang thực hiện</h2>{view.data.acceptedOffers.length ? view.data.acceptedOffers.map((offer) => <Card key={offer.id} className="mb-3"><div className="flex justify-between gap-3"><span className="font-medium">{getAiZoneLabel(offer.targetZoneId)}</span><StatusBadge status="En route" /></div><p className="mt-2 flex items-center gap-1 text-sm text-slate-600"><Navigation className="size-4" />ETA {offer.etaMinutes} phút · thưởng {formatCurrency(offer.incentiveAmount)}</p></Card>) : <p className="text-sm text-slate-500">Chưa có lộ trình nào đang thực hiện.</p>}</section>
    <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Lịch sử của tôi</h2><span className="text-sm font-semibold text-brand-700">Tổng thưởng {formatCurrency(driver.rewardTotal)}</span></div><div className="space-y-2">{view.data.history.map((offer) => <Card key={offer.id} className="p-3"><div className="flex justify-between gap-3"><span className="text-sm font-medium">{getAiZoneLabel(offer.targetZoneId)}</span><StatusBadge status={offer.status} /></div><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Gift className="size-3" />{formatCurrency(offer.incentiveAmount)}</p></Card>)}</div></section>
  </main>
}

function DriverMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-lg bg-white p-2"><span className="mx-auto block size-4 text-brand-600">{icon}</span><dt className="mt-1 text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div> }
