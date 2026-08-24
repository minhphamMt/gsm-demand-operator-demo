import { Route } from 'lucide-react'

import { ActiveOperation } from '@/features/operator-execution/components/ActiveOperation'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function ExecutionPage() {
  return <OperatorWorkspacePage description="Theo dõi và xử lý phương án đã được áp dụng." eyebrow="VẬN HÀNH · DỮ LIỆU TRỰC TIẾP" icon={<Route size={20} />} statusLabel="CẬP NHẬT 15 GIÂY KHI ĐANG VẬN HÀNH" title="Phương án đang vận hành"><ActiveOperation /></OperatorWorkspacePage>
}
