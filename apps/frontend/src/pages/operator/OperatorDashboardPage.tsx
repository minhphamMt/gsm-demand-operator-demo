import { useOutletContext } from 'react-router'

import { OperatorConsoleDashboard } from '@/features/operator-console/OperatorConsoleDashboard'
import type { OperatorShellContext } from '@/shared/components/layout/OperatorShell'

export function OperatorDashboardPage() {
  // Shell không dựng thanh sáng ở trang này, nên nó gửi các điều khiển của mình xuống đây để
  // đầu trang tối nhận. Context có thể vắng khi trang được dựng ngoài shell (test, storybook).
  const shell = useOutletContext<OperatorShellContext | null>()

  return <OperatorConsoleDashboard notifications={shell?.notifications} onSignOut={shell?.onSignOut} userEmail={shell?.userEmail} />
}
