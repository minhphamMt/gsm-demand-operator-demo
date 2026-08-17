import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'

import { Button } from '@/shared/components/ui/Button'

import './feedback-states.css'

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} /> }

export function EmptyState({ description, title }: { description: string; title: string }) {
  return <div className="grid min-h-44 place-items-center rounded-panel border border-dashed border-slate-300 bg-white p-6 text-center"><div><Inbox className="mx-auto size-7 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div></div>
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div role="alert" className="rounded-panel border border-rose-200 bg-rose-50 p-5 text-rose-800"><AlertCircle className="size-5" /><p className="mt-2 font-semibold">Không thể tải dữ liệu vận hành.</p><p className="mt-1 text-sm">Hãy thử lại; không có thay đổi nào được thực hiện.</p>{onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Thử lại</Button>}</div>
}

export function DataRefreshState({ hasError, isFetching, onRetry }: { hasError: boolean; isFetching: boolean; onRetry: () => void }) {
  if (hasError) return <div aria-live="assertive" className="nf-data-refresh-indicator is-error" role="alert"><RefreshCw className="size-3.5" /><span>Dữ liệu cũ</span><button onClick={onRetry} type="button">Tải lại</button></div>
  if (isFetching) return <div aria-live="polite" className="nf-data-refresh-indicator" role="status"><RefreshCw className="size-3.5 animate-spin" /><span>Đang đồng bộ</span></div>
  return null
}
