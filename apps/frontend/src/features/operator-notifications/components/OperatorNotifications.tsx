import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { campaignsQuery, notificationsQuery, offersQuery, plansQuery, useOperatorActions } from '@/features/operator-data'
import { buildOperatorNotifications, type OperatorNotification } from '@/features/operator-notifications/model/operatorNotifications'
import { IconButton } from '@/shared/components/ui/IconButton'
import { env } from '@/shared/config/env'
import { routes } from '@/shared/config/routes'

export function OperatorNotifications() {
  const plans = useQuery(plansQuery())
  const campaigns = useQuery(campaignsQuery())
  const offers = useQuery(offersQuery())
  const persisted = useQuery(notificationsQuery())
  const actions = useOperatorActions()
  const [isOpen, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set())

  const derived: OperatorNotification[] = buildOperatorNotifications(plans.data ?? [], campaigns.data ?? [], offers.data ?? [])
  const notifications: OperatorNotification[] = env.isLiveData
    ? (persisted.data ?? []).map((notification) => ({
        id: notification.id,
        message: notification.message,
        path: notification.entityType === 'proposal' && notification.entityId ? routes.operator.planDetail(notification.entityId) : routes.operator.root,
        tone: notification.severity === 'CRITICAL' ? 'rose' : notification.severity === 'WARNING' ? 'amber' : 'sky',
      }))
    : derived
  const persistedStatus = new Map((persisted.data ?? []).map((notification) => [notification.id, notification.status]))
  const isRead = (id: string) => env.isLiveData ? persistedStatus.get(id) !== 'UNREAD' : readIds.has(id)
  const unreadCount = notifications.filter((notification) => !isRead(notification.id)).length
  const markRead = (id: string) => env.isLiveData ? actions.acknowledgeNotification.mutate(id) : setReadIds((current) => new Set([...current, id]))
  const markAllRead = () => env.isLiveData
    ? (persisted.data ?? []).filter((notification) => notification.status === 'UNREAD').forEach((notification) => actions.acknowledgeNotification.mutate(notification.id))
    : setReadIds(new Set(notifications.map((notification) => notification.id)))

  return (
    <div className="relative">
      <IconButton label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`} onClick={() => setOpen((value) => !value)}>
        <Bell size={19} />
        {unreadCount > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">{unreadCount}</span>}
      </IconButton>
      {isOpen && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Thông báo vận hành</p>
            {unreadCount > 0 && <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700" type="button" onClick={markAllRead}><CheckCheck className="size-3.5" />Đã đọc tất cả</button>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{env.isLiveData ? 'Trạng thái đọc/xác nhận được lưu trong DB và có chủ sở hữu.' : 'Demo lưu trạng thái đọc trong phiên hiện tại.'}</p>
          <div className="mt-3 space-y-2 text-sm">
            {notifications.map((notification) => (
              <Link
                className={`block rounded-lg p-3 ${toneClasses[notification.tone]} ${isRead(notification.id) ? 'opacity-60' : ''}`}
                key={notification.id}
                to={notification.path}
                onClick={() => { markRead(notification.id); setOpen(false) }}
              >
                {notification.message}
              </Link>
            ))}
            {!notifications.length && <p className="rounded-lg bg-slate-50 p-3 text-slate-500">Không có thông báo mới.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

const toneClasses: Record<OperatorNotification['tone'], string> = {
  amber: 'bg-amber-50 text-amber-900',
  emerald: 'bg-emerald-50 text-emerald-900',
  rose: 'bg-rose-50 text-rose-900',
  sky: 'bg-sky-50 text-sky-900',
}
