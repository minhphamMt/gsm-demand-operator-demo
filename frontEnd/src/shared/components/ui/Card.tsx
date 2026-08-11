import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return <section {...props} className={`min-w-0 rounded-panel border border-slate-200 bg-white p-5 shadow-panel ${className}`}>{children}</section>
}
