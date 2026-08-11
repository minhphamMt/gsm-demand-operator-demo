import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { campaignsQuery, offersQuery, plansQuery } from '@/features/operator-data'
import { buildOperatorNotifications, type OperatorNotification } from '@/features/operator-notifications/model/operatorNotifications'
import { IconButton } from '@/shared/components/ui/IconButton'

export function OperatorNotifications() {
  const plans = useQuery(plansQuery())
  const campaigns = useQuery(campaignsQuery())
  const offers = useQuery(offersQuery())
  const [isOpen, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set())

  const notifications: OperatorNotification[] = buildOperatorNotifications(plans.data ?? [], campaigns.data ?? [], offers.data ?? [])
  const unreadCount = notifications.filter((notification) => !readIds.has(notification.id)).length
  const markRead = (id: string) => setReadIds((current) => new Set([...current, id]))
  const markAllRead = () => setReadIds(new Set(notifications.map((notification) => notification.id)))

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
          <p className="mt-1 text-xs text-slate-500">Trạng thái đã đọc chỉ được lưu trong phiên hiện tại.</p>
          <div className="mt-3 space-y-2 text-sm">
            {notifications.map((notification) => (
              <Link
                className={`block rounded-lg p-3 ${toneClasses[notification.tone]} ${readIds.has(notification.id) ? 'opacity-60' : ''}`}
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
