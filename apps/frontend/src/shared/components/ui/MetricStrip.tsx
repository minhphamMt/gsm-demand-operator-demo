import type { ReactNode } from 'react'

export type MetricStripItem = {
  detail?: string
  icon?: ReactNode
  label: string
  tone?: 'default' | 'good' | 'warning'
  value: ReactNode
}

export function MetricStrip({ items }: { items: readonly MetricStripItem[] }) {
  return (
    <dl className="grid overflow-hidden rounded-panel border border-slate-200 bg-white shadow-panel sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div className="border-b border-slate-200 px-4 py-3.5 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0" key={item.label}>
          <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
            {item.icon && <span className="text-brand-600">{item.icon}</span>}
            {item.label}
          </dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${item.tone === 'good' ? 'text-emerald-700' : item.tone === 'warning' ? 'text-amber-700' : 'text-slate-950'}`}>{item.value}</dd>
          {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
        </div>
      ))}
    </dl>
  )
}
