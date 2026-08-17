import { GitCompareArrows } from 'lucide-react'

import { Reports } from '@/features/operator-reports/components/Reports'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function ReportsPage() {
  return <OperatorWorkspacePage
    description="Tác động · chi phí · hiệu quả."
    eyebrow="PHÂN TÍCH · ĐỐI CHIẾU"
    icon={<GitCompareArrows size={20} />}
    statusLabel="DỮ LIỆU GỐC ĐÃ KHÓA"
    title="So sánh kịch bản"
  ><Reports /></OperatorWorkspacePage>
}
