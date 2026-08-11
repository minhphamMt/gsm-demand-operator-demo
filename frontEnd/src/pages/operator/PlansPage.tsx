import { PlanList } from '@/features/operator-plans/components/PlanList'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function PlansPage() { return <><PageHeader title="Hàng đợi gợi ý cần kiểm duyệt" description="Rà soát các phương án đã ghi nhận trong DB; nguồn thủ công, theo luật hoặc mô phỏng luôn được ghi rõ." /><div className="mt-6"><PlanList /></div></> }
