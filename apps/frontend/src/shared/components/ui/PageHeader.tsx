import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 sm:flex-row sm:items-center">
      <div>
        <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">NovaFour · AI Operations</p>
        <h1 className="text-xl font-black tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{description}</p>
      </div>
      {actions}
    </div>
  )
}
