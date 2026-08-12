import { Reports } from '@/features/operator-reports/components/Reports'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function ReportsPage() { return <div className="h-full overflow-y-auto"><PageHeader title="Báo cáo vận hành" description="KPI dịch vụ, hiệu quả điều phối và chi phí — ưu tiên biểu đồ, không diễn giải dài." /><div className="mt-3"><Reports /></div></div> }
