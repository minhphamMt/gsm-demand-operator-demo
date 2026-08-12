import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { routes } from '@/shared/config/routes'
import '@/features/operator-console/operator-console.css'
import '@/features/operator-console/operator-shell.css'

const navItems = [
  { label: 'Điều hành', path: routes.operator.root, matches: (path: string) => path === routes.operator.root || path.startsWith(routes.operator.plans) || path.startsWith(routes.operator.campaigns) },
  { label: 'So sánh kịch bản', path: routes.operator.reports, matches: (path: string) => path.startsWith(routes.operator.reports) },
  { label: 'Nhật ký', path: routes.operator.history, matches: (path: string) => path.startsWith(routes.operator.history) },
] as const

export function OperatorShell({ notifications, onSignOut, userEmail }: { notifications?: ReactNode; onSignOut?: () => void; userEmail?: string | null }) {
  const location = useLocation()
  const systemTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

  return <div className="nf-console">
    <header className="nf-console-header">
      <div className="nf-console-brand"><span className="nf-console-logo" aria-hidden="true">ϟ</span><div><strong>NOVAFOUR OPS</strong><small>ĐIỀU PHỐI XE ĐIỆN · HÀ NỘI</small></div></div>
      <nav className="nf-console-nav" aria-label="Khu vực chính">
        {navItems.map((item) => <NavLink aria-current={item.matches(location.pathname) ? 'page' : undefined} className={item.matches(location.pathname) ? 'is-active' : ''} end={item.path === routes.operator.root} key={item.path} to={item.path}>{item.label}</NavLink>)}
      </nav>
      <div className="nf-console-header-spacer" />
      <div className="nf-console-clock"><small>THỜI GIAN HỆ THỐNG</small><strong>{systemTime}</strong><span>giờ thiết bị</span></div>
      <div className="nf-console-fresh"><small>NGUỒN QUAN SÁT</small><span><i className="nf-live" />Theo snapshot</span></div>
      <span className="tag tag-neutral nf-console-source">NGUỒN HIỂN THỊ TRONG CHI TIẾT</span>
      <div className="nf-console-account">{notifications}<span title={userEmail ?? 'Điều phối viên'}>OP</span>{onSignOut && <button aria-label="Đăng xuất" onClick={onSignOut} title="Đăng xuất" type="button"><LogOut size={15} /></button>}</div>
    </header>
    <main className={location.pathname === routes.operator.root ? 'nf-console-main' : 'nf-console-page'}><Outlet /></main>
  </div>
}
