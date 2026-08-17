import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'

import { PlanDetail } from '@/features/operator-plans/components/PlanDetail'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'
import { routes } from '@/shared/config/routes'

import './plan-detail-page.css'

export function PlanDetailPage() {
  const { planId } = useParams()
  const location = useLocation()
  const isExecutionChild = location.pathname.startsWith(`${routes.operator.execution}/plan/`)

  return <OperatorWorkspacePage
    description={isExecutionChild ? 'Kiểm tra bằng chứng, tác động và ngân sách trong ngữ cảnh phương án đang vận hành.' : 'Kiểm tra bằng chứng AI, tác động và ngân sách; người vận hành quyết định cuối cùng.'}
    eyebrow={isExecutionChild ? 'ĐANG VẬN HÀNH · KIỂM DUYỆT' : 'NOVAFOUR · AI OPERATIONS'}
    icon={<ClipboardCheck size={20} />}
    statusLabel={isExecutionChild ? 'NGỮ CẢNH ĐANG VẬN HÀNH' : 'TỰ ĐỘNG CẬP NHẬT 2 GIÂY'}
    title={isExecutionChild ? 'Xem xét phương án' : 'Phê duyệt phương án'}
  >
    <div className="nf-plan-review-shell">
      <div className="nf-plan-review-crumb">
        <Link to={isExecutionChild ? routes.operator.execution : routes.operator.plans}><ArrowLeft size={15} />{isExecutionChild ? 'Về trang đang vận hành' : 'Về danh sách gợi ý'}</Link>
        <span>{isExecutionChild ? 'Đang vận hành / Chi tiết phương án' : 'Điều hành / Phê duyệt phương án'}</span>
      </div>
      {planId ? <PlanDetail activationRoute={isExecutionChild ? routes.operator.execution : routes.operator.campaigns} detailRoute={isExecutionChild ? routes.operator.executionPlanDetail : routes.operator.planDetail} planId={planId} /> : null}
    </div>
  </OperatorWorkspacePage>
}
