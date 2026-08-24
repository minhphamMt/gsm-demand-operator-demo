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
    description={isExecutionChild ? 'Đối chiếu trước khi tiếp tục điều phối.' : 'Đối chiếu tác động trước khi phê duyệt.'}
    eyebrow={isExecutionChild ? 'ĐANG VẬN HÀNH · PHƯƠNG ÁN' : 'NOVAFOUR · AI OPERATIONS'}
    icon={<ClipboardCheck size={20} />}
    statusLabel={isExecutionChild ? 'NGỮ CẢNH ĐANG VẬN HÀNH · CẬP NHẬT 15 GIÂY' : 'DỮ LIỆU PHƯƠNG ÁN ĐÃ GHI NHẬN'}
    title={isExecutionChild ? 'Chi tiết phương án' : 'Phê duyệt phương án'}
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
