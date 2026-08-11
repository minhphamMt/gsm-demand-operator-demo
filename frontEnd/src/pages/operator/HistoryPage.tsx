import { AuditHistory } from '@/features/operator-history/components/AuditHistory'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function HistoryPage() { return <><PageHeader title="Lịch sử quyết định & Audit" description="Sổ sự kiện append-only ghi nhận mọi phiên bản, quyết định và thay đổi chiến dịch." /><div className="mt-6"><AuditHistory /></div></> }
