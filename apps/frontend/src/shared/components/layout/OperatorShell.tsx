import { LogOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { formatTimeLabel } from '@/features/operator-pipeline/model/timeLabel'
import { operatorNavItems } from '@/shared/components/layout/operatorNavItems'
import { routes } from '@/shared/config/routes'
import { capabilitiesQuery } from '@/features/operator-data'
import { useServerClock } from '@/features/operator-console/hooks/useServerClock'
import { env } from '@/shared/config/env'
import novafourOpsMark from '@/assets/novafour-ops-mark-chatgpt.png'
import { OperatorHeader } from './OperatorHeader'
import '@/features/operator-console/operator-console.css'
import '@/features/operator-console/operator-shell.css'

// Trang Điều hành có đầu trang tối riêng (OpsHeader) mang cùng nhận diện và cùng đồng hồ.
// Dựng thêm thanh sáng của shell ở đó là hai đầu trang chồng nhau, nên shell nhường chỗ và
// đẩy các điều khiển chỉ nó có (điều hướng, thông báo, đăng xuất) xuống qua outlet context.
export type OperatorShellContext = {
  notifications?: ReactNode
  onSignOut?: (() => void) | undefined
  userEmail?: string | null | undefined
}

export function OperatorShell({ notifications, onSignOut, userEmail }: OperatorShellContext) {
  const location = useLocation()
  const navigate = useNavigate()
  const hasOwnHeader = location.pathname === routes.operator.root
  const hasDarkWorkspace = location.pathname.startsWith(routes.operator.execution) || location.pathname.startsWith(routes.operator.reports) || location.pathname.startsWith(routes.operator.history)
  const hasFlushWorkspace = hasDarkWorkspace
  const capabilities = useQuery(capabilitiesQuery())
  const serverTime = useServerClock(capabilities.data?.serverTime, capabilities.isError)
  const systemTime = serverTime ? formatTimeLabel(serverTime) : '--:--'
  const health = capabilities.data?.health

  return <div className="nf-console">
    {!hasOwnHeader && hasDarkWorkspace && <OperatorHeader
      health={health}
      isRefreshing={false}
      notifications={notifications}
      onOpenAgentFlow={() => navigate(routes.operator.root)}
      onSignOut={onSignOut}
      onToggleTheme={() => navigate(routes.operator.root)}
      serverTimeLabel={serverTime ? formatTimeLabel(serverTime) : undefined}
      theme="dark"
      userEmail={userEmail}
    />}
    {!hasOwnHeader && !hasDarkWorkspace && <header className="nf-console-header">
      <div className="nf-console-brand"><img alt="" aria-hidden="true" className="nf-console-logo" src={novafourOpsMark} /><div><strong>NOVAFOUR OPS</strong><small>ĐIỀU PHỐI XE ĐIỆN · HÀ NỘI</small></div></div>
      <nav className="nf-console-nav" aria-label="Khu vực chính">
        {operatorNavItems.map((item) => <NavLink aria-current={item.matches(location.pathname) ? 'page' : undefined} className={item.matches(location.pathname) ? 'is-active' : ''} end={item.path === routes.operator.root} key={item.path} to={item.path}>{item.label}</NavLink>)}
      </nav>
      <div className="nf-console-header-spacer" />
      <div className="nf-console-clock"><small>GIỜ MÁY CHỦ · ICT</small><strong>{systemTime}</strong><span>Asia/Ho_Chi_Minh</span></div>
      <div className="nf-console-fresh"><small>{env.isLiveData ? 'LIVE' : 'DEMO-REPLAY'}</small><span><i className="nf-live" />DB {health?.database ?? '…'} · AI {health?.ai ?? '…'} · MAP {health?.map ?? '…'}</span></div>
      <span className="tag tag-neutral nf-console-source">OPERATOR · {userEmail ?? 'chưa xác định'}</span>
      <div className="nf-console-account">{notifications}<span title={userEmail ?? 'Điều phối viên'}>{(userEmail ?? 'OP').slice(0, 2).toUpperCase()}</span>{onSignOut && <button aria-label="Đăng xuất" onClick={onSignOut} title="Đăng xuất" type="button"><LogOut size={15} /></button>}</div>
    </header>}
    <main className={hasOwnHeader ? 'nf-console-main' : hasFlushWorkspace ? 'nf-console-page nf-console-page--flush' : 'nf-console-page'}><Outlet context={{ notifications, onSignOut, userEmail } satisfies OperatorShellContext} /></main>
  </div>
}
