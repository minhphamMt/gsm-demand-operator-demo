import { Route } from 'lucide-react'

import { ActiveOperation } from '@/features/operator-execution/components/ActiveOperation'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function ExecutionPage() {
  return <OperatorWorkspacePage description="Theo dõi và xử lý phương án đã được áp dụng." eyebrow="VẬN HÀNH · DỮ LIỆU TRỰC TIẾP" icon={<Route size={20} />} statusLabel="TỰ ĐỘNG CẬP NHẬT 2 GIÂY" title="Phương án đang vận hành"><ActiveOperation /></OperatorWorkspacePage>
}
