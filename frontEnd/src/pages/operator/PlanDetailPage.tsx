import { useParams } from 'react-router'

import { PlanDetail } from '@/features/operator-plans/components/PlanDetail'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function PlanDetailPage() { const { planId } = useParams(); return <><PageHeader title="Hồ sơ kiểm duyệt proposal" description="Đối chiếu đầu vào, tác động, policy và ngân sách trước khi ra quyết định có audit." /><div className="mt-6">{planId ? <PlanDetail planId={planId} /> : null}</div></> }
