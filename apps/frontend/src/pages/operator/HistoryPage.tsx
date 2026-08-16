import { ScrollText } from 'lucide-react'

import { AuditHistory } from '@/features/operator-history/components/AuditHistory'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function HistoryPage() {
  return <OperatorWorkspacePage
    description="Theo dõi nhanh ai đã làm gì và kết quả ra sao."
    eyebrow="KIỂM SOÁT · MINH BẠCH"
    icon={<ScrollText size={20} />}
    statusLabel="DỮ LIỆU ĐÃ BẢO TOÀN"
    title="Nhật ký vận hành"
  ><AuditHistory /></OperatorWorkspacePage>
}
