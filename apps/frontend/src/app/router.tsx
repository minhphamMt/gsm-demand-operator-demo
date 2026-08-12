import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { LoginPage, RoleGate, RootRedirect, useAuth } from '@/features/auth'
import { OperatorNotifications } from '@/features/operator-notifications/components/OperatorNotifications'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { RouteErrorPage } from '@/pages/not-found/RouteErrorPage'
import { OperatorDashboardPage } from '@/pages/operator/OperatorDashboardPage'
import { OperatorShell } from '@/shared/components/layout/OperatorShell'
import { Skeleton } from '@/shared/components/ui/FeedbackStates'
import { routes } from '@/shared/config/routes'

const PlansPage = lazy(() => import('@/pages/operator/PlansPage').then((module) => ({ default: module.PlansPage })))
const PlanDetailPage = lazy(() => import('@/pages/operator/PlanDetailPage').then((module) => ({ default: module.PlanDetailPage })))
const CampaignsPage = lazy(() => import('@/pages/operator/CampaignsPage').then((module) => ({ default: module.CampaignsPage })))
const ReportsPage = lazy(() => import('@/pages/operator/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const HistoryPage = lazy(() => import('@/pages/operator/HistoryPage').then((module) => ({ default: module.HistoryPage })))
const DriverPage = lazy(() => import('@/pages/driver/DriverPage').then((module) => ({ default: module.DriverPage })))
const lazyPage = (Page: React.LazyExoticComponent<React.ComponentType>) => <Suspense fallback={<Skeleton className="h-80" />}><Page /></Suspense>

function AuthenticatedOperatorShell() {
  const auth = useAuth()
  if (auth.status !== 'authenticated') return null
  return <OperatorShell notifications={<OperatorNotifications />} onSignOut={() => void auth.signOut()} userEmail={auth.identity.email} />
}

const router = createBrowserRouter([
  { path: routes.root, element: <RootRedirect />, errorElement: <RouteErrorPage /> },
  { path: routes.login, element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    path: routes.operator.root,
    element: <RoleGate role="OPERATOR"><AuthenticatedOperatorShell /></RoleGate>,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <OperatorDashboardPage /> },
      { path: routes.operator.segments.plans, element: lazyPage(PlansPage) },
      { path: routes.operator.segments.planDetail, element: lazyPage(PlanDetailPage) },
      { path: routes.operator.segments.campaigns, element: lazyPage(CampaignsPage) },
      { path: routes.operator.segments.reports, element: lazyPage(ReportsPage) },
      { path: routes.operator.segments.history, element: lazyPage(HistoryPage) },
    ],
  },
  // Driver owns its original in-phone authentication gate and login screen.
  // Keeping the shared RoleGate here would redirect anonymous drivers to the
  // operator-styled /login page and break visual parity with the driver branch.
  { path: routes.driver.root, element: lazyPage(DriverPage) },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
