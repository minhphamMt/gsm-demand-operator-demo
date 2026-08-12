import { useQuery } from '@tanstack/react-query'
import { CarFront, Clock3, Gift, LogOut, MapPin, Navigation, ShieldCheck } from 'lucide-react'
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
  const view = useQuery(driverViewQuery(driverId)); const actions = useDriverActions()
  if (view.isPending) return <div className="mx-auto max-w-sm p-4"><Skeleton className="h-[760px]" /></div>
  if (view.isError) return <div className="mx-auto max-w-sm p-4"><ErrorState onRetry={() => void view.refetch()} /></div>
  if (!view.data) return <EmptyState title="Không tìm thấy tài khoản" description="Vui lòng đăng nhập lại." />
  const { driver } = view.data; const offer = view.data.activeOffers[0]

  return <main className="mx-auto min-h-screen max-w-sm bg-[#f2f5f4] text-slate-950 shadow-2xl">
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4"><div><p className="text-sm font-black">NovaFour Driver</p><p className="text-[10px] text-emerald-700">{driver.status === 'offline' ? 'Ngoại tuyến' : 'Đang hoạt động'}</p></div>{onSignOut && <button aria-label="Đăng xuất" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onSignOut}><LogOut className="size-4" /></button>}</header>
    <div className="p-4">
      {offer ? <Card className="overflow-hidden border-slate-300 p-0"><div className="bg-slate-950 px-5 py-5 text-white"><div className="flex items-center justify-between"><Badge tone="success">Lời mời AI</Badge><span className="flex items-center gap-1 text-xs text-amber-300"><Clock3 className="size-3.5" />12 phút</span></div><p className="mt-6 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Vùng mục tiêu</p><h1 className="mt-1 text-3xl font-black">{getAiZoneLabel(offer.targetZoneId)}</h1><p className="mt-4 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Thưởng điều phối</p><p className="mt-1 text-4xl font-black text-teal-300">{formatCurrency(offer.incentiveAmount)}</p></div><dl className="grid grid-cols-2 border-b border-slate-200 bg-white"><DriverMetric icon={<MapPin />} label="Khoảng cách" value={`${offer.distanceKm} km`} /><DriverMetric icon={<CarFront />} label="ETA" value={`${offer.etaMinutes} phút`} /></dl><div className="p-4"><div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={actions.respond.isPending} onClick={() => actions.respond.mutate({ offerId: offer.id, response: 'Declined' })}>Từ chối</Button><Button isLoading={actions.respond.isPending} onClick={() => actions.respond.mutate({ offerId: offer.id, response: 'Accepted' })}>Nhận lời mời</Button></div><p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="size-3 text-emerald-600" />Không thao tác khi đang lái xe.</p></div></Card> : <EmptyState title="Hiện chưa có lời mời nào" description="Bạn có thể tiếp tục hoạt động bình thường." />}
      {actions.respond.error && <p role="alert" className="mt-3 rounded bg-rose-50 p-3 text-xs text-rose-700">{actions.respond.error.message}</p>}
      <section className="mt-5"><h2 className="mb-2 text-sm font-black">Lộ trình đang thực hiện</h2>{view.data.acceptedOffers.length ? view.data.acceptedOffers.map((item) => <Card key={item.id} className="mb-2 p-3"><div className="flex justify-between"><span className="font-semibold">{getAiZoneLabel(item.targetZoneId)}</span><StatusBadge status="En route" /></div><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Navigation className="size-3.5" />ETA {item.etaMinutes} phút · {formatCurrency(item.incentiveAmount)}</p></Card>) : <p className="text-xs text-slate-500">Chưa có lộ trình đang thực hiện.</p>}</section>
      <section className="mt-5"><div className="mb-2 flex justify-between"><h2 className="text-sm font-black">Gần đây</h2><span className="text-xs font-bold text-teal-700">{formatCurrency(driver.rewardTotal)}</span></div>{view.data.history.slice(0, 3).map((item) => <div className="flex items-center justify-between border-t border-slate-200 py-3 text-xs" key={item.id}><span>{getAiZoneLabel(item.targetZoneId)}</span><span className="flex items-center gap-1 font-semibold"><Gift className="size-3" />{formatCurrency(item.incentiveAmount)}</span></div>)}</section>
    </div>
  </main>
}

function DriverMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="border-r border-slate-200 p-4 text-center last:border-0"><span className="mx-auto block size-4 text-teal-700">{icon}</span><dt className="mt-1 text-[10px] uppercase text-slate-500">{label}</dt><dd className="mt-1 font-black">{value}</dd></div> }
