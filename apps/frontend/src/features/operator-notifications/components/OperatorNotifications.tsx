import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck, ChevronRight, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { campaignsQuery, notificationsQuery, offersQuery, plansQuery, type PersistentNotification, useOperatorActions } from '@/features/operator-data'
import { buildOperatorNotifications, type OperatorNotification } from '@/features/operator-notifications/model/operatorNotifications'
import { IconButton } from '@/shared/components/ui/IconButton'
import { env } from '@/shared/config/env'
import { routes } from '@/shared/config/routes'
import { formatTime } from '@/shared/lib/format'
import '@/features/operator-notifications/operator-notifications.css'

type NotificationPresentation = OperatorNotification & {
  title: string
  detail: string
  context?: string
  createdAt?: string
  severity: PersistentNotification['severity']
}

const eventTitles: Record<string, string> = {
  Created: 'Có phương án mới',
  Revised: 'Phương án đã cập nhật',
  DispatchReleased: 'Đã phát lệnh điều chuyển',
  DispatchCancelled: 'Đã hủy lệnh điều chuyển',
  CampaignCancelled: 'Đã hủy campaign',
  CampaignTargetReached: 'Campaign đã đạt mục tiêu',
  OfferExpired: 'Offer đã hết hạn',
}

const entityTitles: Record<string, string> = {
  proposal: 'Phương án',
  dispatch_batch: 'Batch điều chuyển',
  campaign: 'Campaign',
  offer: 'Offer',
}

export function OperatorNotifications() {
  const plans = useQuery(plansQuery())
  const campaigns = useQuery(campaignsQuery())
  const offers = useQuery(offersQuery())
  const persisted = useQuery(notificationsQuery())
  const actions = useOperatorActions()
  const [isOpen, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  const derived: OperatorNotification[] = buildOperatorNotifications(plans.data ?? [], campaigns.data ?? [], offers.data ?? [])
  const notifications: NotificationPresentation[] = env.isLiveData
    ? (persisted.data ?? []).map(toNotificationPresentation)
    : derived.map((notification) => ({
        ...notification,
        title: derivedTitle(notification),
        detail: notification.message,
        severity: severityForTone(notification.tone),
      }))
  const persistedStatus = new Map((persisted.data ?? []).map((notification) => [notification.id, notification.status]))
  const isRead = (id: string) => env.isLiveData ? persistedStatus.get(id) !== 'UNREAD' : readIds.has(id)
  const unreadCount = notifications.filter((notification) => !isRead(notification.id)).length
  const markRead = (id: string) => env.isLiveData ? actions.acknowledgeNotification.mutate(id) : setReadIds((current) => new Set([...current, id]))
  const markAllRead = () => env.isLiveData
    ? actions.acknowledgeAllNotifications.mutate()
    : setReadIds(new Set(notifications.map((notification) => notification.id)))

  useEffect(() => {
    if (!isOpen) return undefined
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  return (
    <div className="nf-notification-anchor" ref={containerRef}>
      <IconButton className={isOpen ? 'bg-slate-100 text-slate-950' : ''} label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`} onClick={() => setOpen((value) => !value)}>
        <Bell size={19} />
        {unreadCount > 0 && <span className="nf-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </IconButton>
      {isOpen && (
        <div aria-label="Thông báo vận hành" className="nf-notification-menu" role="dialog">
          <header className="nf-notification-header">
            <div className="nf-notification-heading">
              <span className="nf-notification-heading-icon"><Bell size={17} /></span>
              <div>
                <div className="nf-notification-title-row">
                  <h2>Thông báo vận hành</h2>
                  {notifications.length > 0 && <span className="nf-notification-total">{notifications.length}</span>}
                </div>
                <p>{unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Bạn đã xem hết thông báo'}</p>
              </div>
            </div>
            {unreadCount > 0 && <button aria-label="Đánh dấu tất cả đã đọc" className="nf-notification-mark-read" type="button" onClick={markAllRead}><CheckCheck size={14} /><span>Đánh dấu đã đọc</span></button>}
          </header>
          <div className="nf-notification-list" aria-live="polite">
            {notifications.map((notification) => {
              const read = isRead(notification.id)
              return <Link
                aria-label={`${notification.title}: ${notification.detail}`}
                className={`nf-notification-item is-${notification.tone} ${read ? 'is-read' : 'is-unread'}`}
                key={notification.id}
                title={notification.message}
                to={notification.path}
                onClick={() => { markRead(notification.id); setOpen(false) }}
              >
                <span className="nf-notification-item-icon"><NotificationIcon tone={notification.tone} /></span>
                <span className="nf-notification-item-body">
                  <span className="nf-notification-item-topline">
                    <strong>{notification.title}</strong>
                    {!read && <span className="nf-notification-new">Mới</span>}
                  </span>
                  <span className="nf-notification-detail">{notification.detail}</span>
                  <span className="nf-notification-meta">
                    {notification.context && <span>{notification.context}</span>}
                    {notification.createdAt && <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>}
                  </span>
                </span>
                <ChevronRight className="nf-notification-chevron" size={16} />
              </Link>
            })}
            {!notifications.length && <div className="nf-notification-empty"><CircleCheck size={22} /><strong>Không có thông báo mới</strong><span>Mọi hoạt động đang ổn định.</span></div>}
          </div>
          <footer className="nf-notification-footer">{env.isLiveData ? 'Tự động đồng bộ theo hoạt động hệ thống' : 'Demo · trạng thái đọc lưu trong phiên này'}</footer>
        </div>
      )}
    </div>
  )
}

function toNotificationPresentation(notification: PersistentNotification): NotificationPresentation {
  const tone = notification.severity === 'CRITICAL' ? 'rose' : notification.severity === 'WARNING' ? 'amber' : 'sky'
  return {
    id: notification.id,
    message: notification.message,
    path: notification.entityType === 'proposal' && notification.entityId ? routes.operator.planDetail(notification.entityId) : routes.operator.root,
    tone,
    title: eventTitles[notification.title] ?? eventTitles[notification.category] ?? humanizeEvent(notification.title || notification.category),
    detail: cleanNotificationDetail(notification.message, notification.entityType),
    context: notification.entityType ? `${entityTitles[notification.entityType] ?? humanizeEvent(notification.entityType)}${notification.entityId ? ` · ${shortId(notification.entityId)}` : ''}` : 'Hoạt động hệ thống',
    createdAt: notification.createdAt,
    severity: notification.severity,
  }
}

function derivedTitle(notification: OperatorNotification) {
  const message = notification.message.toLowerCase()
  if (message.includes('chờ kiểm duyệt')) return 'Chờ kiểm duyệt'
  if (message.includes('hết hạn')) return 'Offer hết hạn'
  if (message.includes('ngân sách')) return 'Cảnh báo ngân sách'
  if (message.includes('không còn tài xế')) return 'Thiếu tài xế'
  if (message.includes('chấp nhận offer')) return 'Phản hồi offer'
  if (message.includes('đạt mục tiêu')) return 'Đã đạt mục tiêu'
  if (notification.tone === 'rose') return 'Cần xử lý ngay'
  if (notification.tone === 'amber') return 'Cần chú ý'
  if (notification.tone === 'emerald') return 'Đã đạt mục tiêu'
  return 'Cập nhật vận hành'
}

function severityForTone(tone: OperatorNotification['tone']): PersistentNotification['severity'] {
  return tone === 'rose' ? 'CRITICAL' : tone === 'amber' ? 'WARNING' : 'INFO'
}

function humanizeEvent(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function cleanNotificationDetail(message: string, entityType: string | null) {
  const normalized = message.trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, (value) => shortId(value))
  return normalized.replace(entityType === 'dispatch_batch' ? /\bdispatch_batch\b/g : /$^/, 'batch điều chuyển')
}

function formatNotificationTime(value: string) {
  return formatTime(value).replace(' ', ' · ')
}

function NotificationIcon({ tone }: { tone: OperatorNotification['tone'] }) {
  if (tone === 'rose') return <CircleAlert size={16} />
  if (tone === 'emerald') return <CircleCheck size={16} />
  if (tone === 'amber') return <CircleAlert size={16} />
  return <Info size={16} />
}
