import { BarChart3, ClipboardList, History, LayoutDashboard, MapPinned, type LucideIcon } from 'lucide-react'

import { routes } from '@/shared/config/routes'

export type NavigationItem = { label: string; path: string; icon: LucideIcon }
export const operatorNavigation: readonly NavigationItem[] = [
  { label: 'Bản đồ điều phối', path: routes.operator.root, icon: LayoutDashboard },
  { label: 'Gợi ý điều phối', path: routes.operator.plans, icon: ClipboardList },
  { label: 'Chiến dịch & offer', path: routes.operator.campaigns, icon: MapPinned },
  { label: 'Báo cáo vận hành', path: routes.operator.reports, icon: BarChart3 },
  { label: 'Lịch sử & Audit', path: routes.operator.history, icon: History },
]
