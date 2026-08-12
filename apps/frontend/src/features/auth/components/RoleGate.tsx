import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import type { AppRole } from '@/features/auth/model/types'
import { useAuth } from '@/features/auth/useAuth'
import { Skeleton } from '@/shared/components/ui/FeedbackStates'
import { routes } from '@/shared/config/routes'

export function RoleGate({ children, role }: { children: ReactNode; role: AppRole }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <div className="mx-auto max-w-2xl p-6"><Skeleton className="h-80" /></div>
  if (auth.status === 'anonymous') return <Navigate replace state={{ from: location.pathname }} to={routes.login} />
  if (auth.identity.role !== role) {
    return <Navigate replace to={auth.identity.role === 'OPERATOR' ? routes.operator.root : routes.driver.root} />
  }
  return children
}

export function RootRedirect() {
  const auth = useAuth()
  if (auth.status === 'loading') return <div className="mx-auto max-w-2xl p-6"><Skeleton className="h-80" /></div>
  if (auth.status === 'anonymous') return <Navigate replace to={routes.login} />
  return <Navigate replace to={auth.identity.role === 'OPERATOR' ? routes.operator.root : routes.driver.root} />
}
