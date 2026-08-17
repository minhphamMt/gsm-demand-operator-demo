import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router'

import { auditActionLabels, type AuditEntry } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { DataTable, TableCell, TableHead } from '@/shared/components/ui/DataTable'
import { routes } from '@/shared/config/routes'

export function AuditTable({ entries }: { entries: readonly AuditEntry[] }) {
  let previousDate = ''
  return <div className="nf-history-table"><DataTable label="Lịch sử quyết định và audit">
    <TableHead><tr><th className="px-3 py-3">Thời gian</th><th className="px-3 py-3">Sự kiện</th><th className="px-3 py-3">Người thực hiện</th><th className="px-3 py-3">Thực thể</th><th className="px-3 py-3">Kết quả</th></tr></TableHead>
    <tbody>{entries.map((entry) => {
      const dateKey = new Date(entry.occurredAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const showDate = dateKey !== previousDate
      previousDate = dateKey
      return [
        showDate && <tr key={`date-${dateKey}`}><td className="border-y border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500" colSpan={5}>{dateKey}</td></tr>,
        <AuditRow entry={entry} key={entry.id} />,
      ]
    })}</tbody>
  </DataTable></div>
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const entityId = entry.entityId ?? entry.planId
  const shortId = entityId.length > 14 ? `${entityId.slice(0, 8)}…${entityId.slice(-4)}` : entityId
  return <tr>
    <TableCell><time className="font-medium tabular-nums text-slate-900" dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></TableCell>
    <TableCell className="max-w-xl"><ActionBadge action={entry.action} /></TableCell>
    <TableCell>{actorLabel(entry.actor)}</TableCell>
    <TableCell><span className="block text-xs text-slate-500">{entityLabel(entry.entityType)}{entry.entityVersion ? ` · v${entry.entityVersion}` : ''}</span>{entry.planId ? <Link className="hover:underline" to={routes.operator.planDetail(entry.planId)}><code className="text-xs font-semibold text-slate-700" title={entityId}>{shortId}</code></Link> : <code className="text-xs font-semibold text-slate-700" title={entityId}>{shortId}</code>}<AuditMetadata entry={entry} /></TableCell>
    <TableCell><span className="nf-audit-saved"><CheckCircle2 size={15} />Đã lưu</span></TableCell>
  </tr>
}

function AuditMetadata({ entry }: { entry: AuditEntry }) {
  if (!entry.detail && !entry.requestId && !entry.entityHash) return null
  return <details className="nf-audit-technical"><summary>Chi tiết</summary>{entry.detail && <small>{entry.detail}</small>}{entry.requestId && <small>req {entry.requestId.slice(0, 12)}…</small>}{entry.entityHash && <small>hash {entry.entityHash.slice(0, 12)}…</small>}</details>
}

function actorLabel(actor: AuditEntry['actor']) {
  return actor === 'OPERATOR' ? 'Điều hành' : actor === 'DRIVER' ? 'Tài xế' : actor === 'SYSTEM' ? 'Hệ thống' : actor
}

function entityLabel(entityType: AuditEntry['entityType']) {
  const labels: Record<string, string> = { proposal: 'Phương án', campaign: 'Chiến dịch', offer: 'Đề nghị', driver: 'Tài xế', trip: 'Chuyến đi', reward: 'Phần thưởng', notification: 'Thông báo' }
  return labels[entityType ?? 'proposal'] ?? entityType ?? 'Phương án'
}

function ActionBadge({ action }: { action: AuditEntry['action'] }) {
  const tone = action === 'Rejected' || action === 'CampaignCancelled' ? 'danger' : action === 'Approved' || action === 'OfferAccepted' || action === 'CampaignTargetReached' ? 'success' : action === 'Created' || action === 'Revised' || action === 'ActivationStarted' ? 'info' : 'neutral'
  const runtimeLabels: Record<string, string> = { NotificationAcknowledged: 'Đã xem thông báo' }
  const label = auditActionLabels[action] ?? runtimeLabels[action] ?? action.replace(/([a-z])([A-Z])/g, '$1 $2')
  return <Badge tone={tone}>{label}</Badge>
}
