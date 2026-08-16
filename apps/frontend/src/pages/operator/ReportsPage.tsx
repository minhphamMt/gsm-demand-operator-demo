import { GitCompareArrows } from 'lucide-react'

import { Reports } from '@/features/operator-reports/components/Reports'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function ReportsPage() {
  return <OperatorWorkspacePage
    description="Nhìn nhanh tác động, chi phí và phương án phù hợp nhất."
    eyebrow="PHÂN TÍCH · CÙNG ĐẦU VÀO"
    icon={<GitCompareArrows size={20} />}
    statusLabel="DỮ LIỆU GỐC ĐÃ KHÓA"
    title="So sánh kịch bản"
  ><Reports /></OperatorWorkspacePage>
}
