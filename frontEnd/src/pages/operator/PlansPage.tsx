import { PlanList } from '@/features/operator-plans/components/PlanList'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function PlansPage() { return <div className="h-full overflow-y-auto"><PageHeader title="So sánh phương án AI" description="Đối chiếu tác động, ETA, chi phí và chính sách trước khi chọn phương án." /><div className="mt-3"><PlanList /></div></div> }
