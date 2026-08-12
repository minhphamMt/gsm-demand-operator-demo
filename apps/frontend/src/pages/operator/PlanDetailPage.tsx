import { useParams } from 'react-router'

import { PlanDetail } from '@/features/operator-plans/components/PlanDetail'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function PlanDetailPage() { const { planId } = useParams(); return <div className="h-full overflow-y-auto"><PageHeader title="Phê duyệt phương án" description="Kiểm tra bằng chứng AI, tác động và ngân sách; người vận hành quyết định cuối cùng." /><div className="mt-3">{planId ? <PlanDetail planId={planId} /> : null}</div></div> }
