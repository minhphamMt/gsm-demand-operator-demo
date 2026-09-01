import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { capabilitiesQuery } from '@/features/operator-data'
import { useServerClock } from '@/features/operator-console/hooks/useServerClock'
import { formatTimeLabel } from '@/features/operator-pipeline/model/timeLabel'
import { routes } from '@/shared/config/routes'
import { useAppTheme } from '@/shared/theme/useAppTheme'
import { OperatorHeader } from './OperatorHeader'
import '@/features/operator-console/operator-console.css'
import '@/features/operator-console/operator-shell.css'

export type OperatorShellContext = {
  notifications?: ReactNode
  onSignOut?: (() => void) | undefined
  userEmail?: string | null | undefined
}

export function OperatorShell({ notifications, onSignOut, userEmail }: OperatorShellContext) {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useAppTheme()
  const hasOwnHeader = location.pathname === routes.operator.root
  const hasFlushWorkspace = location.pathname.startsWith(routes.operator.execution)
    || location.pathname.startsWith(routes.operator.reports)
    || location.pathname.startsWith(routes.operator.history)
  const capabilities = useQuery(capabilitiesQuery())
  const serverTime = useServerClock(capabilities.data?.serverTime, capabilities.isError)
  const health = capabilities.data?.health

  return <div className="nf-console" data-theme={theme}>
    {!hasOwnHeader && <OperatorHeader
      health={health}
      isRefreshing={false}
      notifications={notifications}
      onOpenAgentFlow={() => navigate(routes.operator.root)}
      onSignOut={onSignOut}
      onToggleTheme={toggleTheme}
      serverTimeLabel={serverTime ? formatTimeLabel(serverTime) : undefined}
      theme={theme}
      userEmail={userEmail}
    />}
    <main className={hasOwnHeader ? 'nf-console-main' : hasFlushWorkspace ? 'nf-console-page nf-console-page--flush' : 'nf-console-page'}>
      <Outlet context={{ notifications, onSignOut, userEmail } satisfies OperatorShellContext} />
    </main>
  </div>
}
