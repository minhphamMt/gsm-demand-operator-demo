import { auditActionLabels, type AuditEntry } from '@/features/operator-data'
import { Card } from '@/shared/components/ui/Card'
import { formatTime } from '@/shared/lib/format'

export function PlanAuditTrail({ entries }: { entries: readonly AuditEntry[] }) {
  return <Card><h3 className="font-semibold text-slate-950">Dấu vết quyết định</h3><p className="mt-1 text-sm text-slate-500">Append-only theo proposal và phiên bản.</p><ol className="relative mt-4 border-l border-slate-200 pl-5">{entries.map((entry) => <li key={entry.id} className="relative pb-5 last:pb-0"><span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-brand-500 ring-4 ring-white" /><p className="text-sm font-semibold text-slate-900">{auditActionLabels[entry.action]}</p><p className="mt-0.5 text-sm text-slate-600">{entry.detail}</p><p className="mt-1 text-xs text-slate-400">{entry.actor} · {formatTime(entry.occurredAt)}</p></li>)}</ol></Card>
}
