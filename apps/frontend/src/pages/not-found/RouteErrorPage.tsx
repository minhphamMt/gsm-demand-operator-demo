import { AlertTriangle } from 'lucide-react'
import { Link, useRouteError } from 'react-router'

import { routes } from '@/shared/config/routes'

export function RouteErrorPage() {
  const routeError = useRouteError()
  const message = routeError instanceof Error ? routeError.message : 'Không thể tải nội dung trang.'

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto text-amber-600" size={40} aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">Đã xảy ra lỗi</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <Link className="mt-6 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" to={routes.operator.root}>
          Về tổng quan vận hành
        </Link>
      </div>
    </main>
  )
}
