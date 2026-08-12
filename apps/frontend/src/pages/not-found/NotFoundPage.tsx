import { Link } from 'react-router'

import { routes } from '@/shared/config/routes'

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-emerald-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Không tìm thấy trang</h1>
        <Link className="mt-6 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" to={routes.operator.root}>
          Về tổng quan vận hành
        </Link>
      </div>
    </main>
  )
}
