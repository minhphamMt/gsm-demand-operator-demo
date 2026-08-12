import { AuditHistory } from '@/features/operator-history/components/AuditHistory'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function HistoryPage() { return <div className="h-full overflow-y-auto"><PageHeader title="Lịch sử & Audit" description="Tra cứu actor, hành động, đối tượng và bằng chứng của từng quyết định." /><div className="mt-3"><AuditHistory /></div></div> }
