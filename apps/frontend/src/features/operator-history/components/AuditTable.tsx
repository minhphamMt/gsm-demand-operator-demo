import { auditActionLabels, type AuditEntry } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'

export function AuditTable({ entries }: { entries: readonly AuditEntry[] }) {
  let previousDate = ''
  return <DataTable label="Lịch sử quyết định và audit"><TableHead><tr><th className="px-3 py-3">Thời gian</th><th className="px-3 py-3">Hành động</th><th className="px-3 py-3">Người thực hiện</th><th className="px-3 py-3">Thực thể</th><th className="px-3 py-3">Chi tiết thay đổi</th><th className="px-3 py-3">Kết quả</th></tr></TableHead><tbody>{entries.map((entry) => { const dateKey = new Date(entry.occurredAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); const showDate = dateKey !== previousDate; previousDate = dateKey; return [showDate && <tr key={`date-${dateKey}`}><td className="border-y border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500" colSpan={6}>{dateKey}</td></tr>, <tr className="hover:bg-slate-50/70" key={entry.id}><TableCell><time className="font-medium tabular-nums text-slate-900" dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></TableCell><TableCell><ActionBadge action={entry.action} /></TableCell><TableCell>{entry.actor}</TableCell><TableCell><span className="block text-xs uppercase text-slate-500">{entry.entityType ?? 'proposal'}</span><code className="text-xs font-semibold text-slate-700">{entry.entityId ?? entry.planId}</code></TableCell><TableCell className="max-w-md text-slate-600">{entry.detail}</TableCell><TableCell><span className="text-xs font-semibold text-emerald-700">Đã ghi nhận</span></TableCell></tr>] })}</tbody></DataTable>
}

function ActionBadge({ action }: { action: AuditEntry['action'] }) {
  const tone = action === 'Rejected' || action === 'CampaignCancelled' ? 'danger' : action === 'Approved' || action === 'OfferAccepted' || action === 'CampaignTargetReached' ? 'success' : action === 'Created' || action === 'Revised' || action === 'ActivationStarted' ? 'info' : 'neutral'
  return <Badge tone={tone}>{auditActionLabels[action]}</Badge>
}
