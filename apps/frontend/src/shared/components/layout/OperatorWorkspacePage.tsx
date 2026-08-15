import type { ReactNode } from 'react'

import './operator-workspace-page.css'

type OperatorWorkspacePageProps = {
  children: ReactNode
  description: string
  eyebrow: string
  icon: ReactNode
  statusLabel: string
  title: string
}

export function OperatorWorkspacePage({ children, description, eyebrow, icon, statusLabel, title }: OperatorWorkspacePageProps) {
  return (
    <div className="nf-workspace-page">
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
      <div className="nf-workspace-body nf-scroll">{children}</div>
    </div>
  )
}
