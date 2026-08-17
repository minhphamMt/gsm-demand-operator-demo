import { ScrollText } from 'lucide-react'

import { AuditHistory } from '@/features/operator-history/components/AuditHistory'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function HistoryPage() {
  return <OperatorWorkspacePage
    description="Ai làm gì · kết quả."
    eyebrow="KIỂM SOÁT · AUDIT"
    icon={<ScrollText size={20} />}
    statusLabel="DỮ LIỆU ĐÃ BẢO TOÀN"
    title="Nhật ký vận hành"
  ><AuditHistory /></OperatorWorkspacePage>
}
