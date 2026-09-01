import { Bot, ChevronRight, LogOut, Moon, RefreshCw, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'

import { operatorNavItems } from './operatorNavItems'
import { routes } from '@/shared/config/routes'
import novafourOpsLogoDark from '@/assets/novafour-ops-logo-dark.png'
import novafourOpsLogoLight from '@/assets/novafour-ops-logo-light.png'

import './operator-header.css'

export type AgentRunSummary = {
  done: number
  running: number
  total: number
  warning: number
}

export type OperatorHeaderHealth = {
  api: string
  database: string
  ai: string
  map: string
}

export type OperatorHeaderProps = {
  agentSummary?: AgentRunSummary | undefined
  health?: OperatorHeaderHealth | undefined
  isRefreshing: boolean
  notifications?: ReactNode
  onOpenAgentFlow: () => void
  onSignOut?: (() => void) | undefined
  onToggleTheme: () => void
  serverTimeLabel?: string | undefined
  theme: 'dark' | 'light'
  userEmail?: string | null | undefined
}

export function OperatorHeader({
  agentSummary,
  health,
  isRefreshing,
  notifications,
  onOpenAgentFlow,
  onSignOut,
  onToggleTheme,
  serverTimeLabel,
  theme,
  userEmail,
}: OperatorHeaderProps) {
  const location = useLocation()

  return <header className="nf-ops-header" data-theme={theme}>
    <div className="nf-ops-brand">
      <img
        alt="NOVAFOUR"
        className="nf-ops-brand__logo"
        src={theme === 'dark' ? novafourOpsLogoDark : novafourOpsLogoLight}
      />
    </div>

    <nav aria-label="Khu vực chính" className="nf-ops-nav">
      {operatorNavItems.map((item) => <NavLink
        aria-current={item.matches(location.pathname) ? 'page' : undefined}
        className={item.matches(location.pathname) ? 'is-active' : ''}
        end={item.path === routes.operator.root}
        key={item.path}
        to={item.path}
      >{item.label}</NavLink>)}
    </nav>

    <div className="nf-ops-header__tools">
      <button className="nf-agent-summary" onClick={onOpenAgentFlow} type="button">
        <span className="nf-agent-summary__icon"><Bot size={13} /></span>
        <span className="nf-agent-summary__copy">
          <strong>Luồng agent</strong>
          <small>{agentSummary
            ? agentSummary.running > 0
              ? `${agentSummary.running} agent đang chạy`
              : `${agentSummary.done}/${agentSummary.total} đã xong${agentSummary.warning > 0 ? ` · ${agentSummary.warning} cảnh báo` : ''}`
            : 'Chưa chạy lượt nào'}</small>
        </span>
        <ChevronRight size={13} />
      </button>
      {health && <span className="nf-ops-health" title={`DB ${health.database} · AI ${health.ai} · MAP ${health.map}`}>
        <i className="nf-ops-health__dot" />DB {health.database} · AI {health.ai} · MAP {health.map}
      </span>}
      {serverTimeLabel && <time className="nf-ops-clock">{serverTimeLabel}</time>}
      {isRefreshing && <RefreshCw aria-label="Đang làm mới dữ liệu" className="nf-ops-refreshing" size={13} />}
      <button
        aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
        aria-pressed={theme === 'light'}
        className="nf-ops-refresh"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
        type="button"
      >{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
      {(notifications || userEmail || onSignOut) && <div className="nf-ops-account">
        {notifications}
        {userEmail !== undefined && <span title={userEmail ?? 'Điều phối viên'}>{(userEmail ?? 'OP').slice(0, 2).toUpperCase()}</span>}
        {onSignOut && <button aria-label="Đăng xuất" className="nf-ops-refresh" onClick={onSignOut} title="Đăng xuất" type="button"><LogOut size={14} /></button>}
      </div>}
    </div>
  </header>
}
