import type { ReactNode } from 'react'

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className="w-full max-w-full overflow-x-auto"><table aria-label={label} className="w-full min-w-[720px] border-collapse text-left text-sm">{children}</table></div>
}

export function TableHead({ children }: { children: ReactNode }) { return <thead className="border-y border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{children}</thead> }
export function TableCell({ children, className = '' }: { children: ReactNode; className?: string }) { return <td className={`border-b border-slate-100 px-3 py-3.5 align-middle ${className}`}>{children}</td> }
