import type { ReactNode } from 'react'
import { useLocation } from 'react-router'

import { ExecutionSectionNav } from '@/features/operator-execution/components/ExecutionSectionNav'
import { routes } from '@/shared/config/routes'
import { useAppTheme } from '@/shared/theme/useAppTheme'
import './operator-workspace-page.css'

type OperatorWorkspacePageProps = {
  children: ReactNode
  description: string
  eyebrow: string
  icon: ReactNode
  statusLabel: string
  subNavigation?: ReactNode
  title: string
}

export function OperatorWorkspacePage({ children, description, eyebrow, icon, statusLabel, subNavigation, title }: OperatorWorkspacePageProps) {
  const location = useLocation()
  const { theme } = useAppTheme()
  const showExecutionNavigation = location.pathname.startsWith(routes.operator.execution)
  const useOperationsDarkTheme = theme === 'dark'

  return (
    <div className={`nf-workspace-page${useOperationsDarkTheme ? ' nf-workspace-page--dark' : ''}`} data-theme={theme}>
      <header className="nf-workspace-heading">
        <span aria-hidden="true" className="nf-workspace-heading-icon">{icon}</span>
        <div className="nf-workspace-heading-copy">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </div>
        <div className="nf-workspace-heading-status">
          <small>TRẠNG THÁI DỮ LIỆU</small>
          <strong><i className="nf-live" />{statusLabel}</strong>
        </div>
      </header>
      {subNavigation ?? (showExecutionNavigation ? <ExecutionSectionNav /> : null)}
      <div className="nf-workspace-body nf-scroll">{children}</div>
    </div>
  )
}
