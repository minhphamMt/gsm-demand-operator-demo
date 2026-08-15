import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AuditUrlFilters } from '@/features/operator-history/model/auditFilters'
import { auditActionLabels } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Input, Select } from '@/shared/components/ui/Field'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function AuditFilterForm({ filters, onApply, onReset }: { filters: AuditUrlFilters; onApply: (filters: AuditUrlFilters) => void; onReset: () => void }) {
  const [draft, setDraft] = useState(filters)
  useEffect(() => setDraft(filters), [filters])
  const entityError = draft.entityId && !uuidPattern.test(draft.entityId) ? 'Mã thực thể phải là UUID hợp lệ.' : ''
  const dateError = draft.from && draft.to && draft.from > draft.to ? 'Ngày bắt đầu phải trước ngày kết thúc.' : ''
  const set = <K extends keyof AuditUrlFilters>(key: K, value: AuditUrlFilters[K]) => setDraft((current) => ({ ...current, [key]: value }))

  return <Card className="nf-workspace-panel p-4"><form onSubmit={(event) => { event.preventDefault(); if (!entityError && !dateError) onApply({ ...draft, page: 1 }) }}>
    <div className="nf-audit-filter-primary">
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Tìm theo mã</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><Input aria-describedby={entityError ? 'audit-entity-error' : undefined} aria-invalid={Boolean(entityError)} className="mt-0 pl-9" placeholder="UUID proposal, campaign hoặc offer" value={draft.entityId} onChange={(event) => set('entityId', event.target.value.trim())} /></span>{entityError && <span className="mt-1 block text-xs text-rose-700" id="audit-entity-error">UUID không hợp lệ.</span>}</label>
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Hành động</span><Select aria-label="Lọc hành động" className="mt-0" value={draft.action} onChange={(event) => set('action', event.target.value as AuditUrlFilters['action'])}><option value="">Tất cả hành động</option>{Object.entries(auditActionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
      <div className="flex items-end gap-2"><Button type="submit">Lọc</Button><Button aria-label="Xóa bộ lọc" type="button" variant="ghost" onClick={onReset}><RotateCcw className="size-4" />Xóa</Button></div>
    </div>
    <details className="nf-filter-more"><summary><SlidersHorizontal size={14} />Bộ lọc nâng cao</summary><div className="grid gap-3 pt-3 md:grid-cols-2 xl:grid-cols-5">
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Loại thực thể</span><Select aria-label="Lọc loại thực thể" className="mt-0" value={draft.entityType} onChange={(event) => set('entityType', event.target.value)}><option value="">Mọi loại</option><option value="proposal">Proposal</option><option value="campaign">Campaign</option><option value="offer">Offer</option><option value="driver">Tài xế</option><option value="trip">Chuyến đi</option><option value="reward">Phần thưởng</option></Select></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Vai trò</span><Select aria-label="Lọc vai trò thực hiện" className="mt-0" value={draft.actorType} onChange={(event) => set('actorType', event.target.value)}><option value="">Mọi vai trò</option><option value="OPERATOR">Operator</option><option value="DRIVER">Tài xế</option><option value="SYSTEM">Hệ thống</option></Select></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Từ ngày</span><Input aria-label="Từ ngày" className="mt-0" type="date" value={draft.from} onChange={(event) => set('from', event.target.value)} /></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Đến ngày</span><Input aria-describedby={dateError ? 'audit-date-error' : undefined} aria-invalid={Boolean(dateError)} aria-label="Đến ngày" className="mt-0" type="date" value={draft.to} onChange={(event) => set('to', event.target.value)} />{dateError && <span className="mt-1 block text-xs text-rose-700" id="audit-date-error">Khoảng ngày không hợp lệ.</span>}</label>
      <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Số dòng</span><Select aria-label="Số dòng mỗi trang" className="mt-0" value={draft.pageSize} onChange={(event) => set('pageSize', Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} dòng</option>)}</Select></label>
    </div></details>
  </form></Card>
}
