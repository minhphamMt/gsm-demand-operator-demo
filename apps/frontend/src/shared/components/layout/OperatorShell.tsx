import { LogOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { routes } from '@/shared/config/routes'
import { capabilitiesQuery } from '@/features/operator-data'
import { env } from '@/shared/config/env'
import '@/features/operator-console/operator-console.css'
import '@/features/operator-console/operator-shell.css'

const navItems = [
  { label: 'Điều hành', path: routes.operator.root, matches: (path: string) => path === routes.operator.root || path.startsWith(routes.operator.plans) || path.startsWith(routes.operator.campaigns) },
  { label: 'Đang vận hành', path: routes.operator.execution, matches: (path: string) => path.startsWith(routes.operator.execution) },
  { label: 'So sánh kịch bản', path: routes.operator.reports, matches: (path: string) => path.startsWith(routes.operator.reports) },
  { label: 'Nhật ký', path: routes.operator.history, matches: (path: string) => path.startsWith(routes.operator.history) },
] as const

export function OperatorShell({ notifications, onSignOut, userEmail }: { notifications?: ReactNode; onSignOut?: () => void; userEmail?: string | null }) {
  const location = useLocation()
  const hasFlushWorkspace = location.pathname.startsWith(routes.operator.execution) || location.pathname.startsWith(routes.operator.reports) || location.pathname.startsWith(routes.operator.history)
  const capabilities = useQuery(capabilitiesQuery())
  const serverTime = capabilities.data?.serverTime ?? new Date().toISOString()
  const systemTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(serverTime))
  const health = capabilities.data?.health

  return <div className="nf-console">
    <header className="nf-console-header">
      <div className="nf-console-brand"><span className="nf-console-logo" aria-hidden="true">ϟ</span><div><strong>NOVAFOUR OPS</strong><small>ĐIỀU PHỐI XE ĐIỆN · HÀ NỘI</small></div></div>
      <nav className="nf-console-nav" aria-label="Khu vực chính">
        {navItems.map((item) => <NavLink aria-current={item.matches(location.pathname) ? 'page' : undefined} className={item.matches(location.pathname) ? 'is-active' : ''} end={item.path === routes.operator.root} key={item.path} to={item.path}>{item.label}</NavLink>)}
      </nav>
      <div className="nf-console-header-spacer" />
      <div className="nf-console-clock"><small>GIỜ MÁY CHỦ · ICT</small><strong>{systemTime}</strong><span>Asia/Ho_Chi_Minh</span></div>
      <div className="nf-console-fresh"><small>{env.isLiveData ? 'LIVE' : 'DEMO-REPLAY'}</small><span><i className="nf-live" />DB {health?.database ?? '…'} · AI {health?.ai ?? '…'} · MAP {health?.map ?? '…'}</span></div>
      <span className="tag tag-neutral nf-console-source">OPERATOR · {userEmail ?? 'chưa xác định'}</span>
      <div className="nf-console-account">{notifications}<span title={userEmail ?? 'Điều phối viên'}>{(userEmail ?? 'OP').slice(0, 2).toUpperCase()}</span>{onSignOut && <button aria-label="Đăng xuất" onClick={onSignOut} title="Đăng xuất" type="button"><LogOut size={15} /></button>}</div>
    </header>
    <main className={location.pathname === routes.operator.root ? 'nf-console-main' : hasFlushWorkspace ? 'nf-console-page nf-console-page--flush' : 'nf-console-page'}><Outlet /></main>
  </div>
}
