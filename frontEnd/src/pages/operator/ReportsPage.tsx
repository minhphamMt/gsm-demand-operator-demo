import { Reports } from '@/features/operator-reports/components/Reports'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function ReportsPage() { return <><PageHeader title="Báo cáo hiệu quả vận hành — GSM-14" description="Theo dõi tác động cung cầu, hiệu quả campaign và chi phí vận hành theo kỳ." /><div className="mt-6"><Reports /></div></> }
