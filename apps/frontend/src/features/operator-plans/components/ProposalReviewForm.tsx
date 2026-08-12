import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import type { Proposal, RevisePlanRequest } from '@/features/operator-data'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { FieldLabel, Input, Select, Textarea } from '@/shared/components/ui/Field'
import { AppError, getFieldErrors, type FieldErrors } from '@/shared/api/client'
import { formatCurrency, formatMultiplier } from '@/shared/lib/format'

type Props = { error?: unknown; isSaving: boolean; plan: Proposal; onRevise: (request: RevisePlanRequest) => void }

const fallbackMessages: Readonly<Record<string, string>> = {
  bonusAmount: 'Thưởng đến vùng không được là số âm.',
  budgetLimit: 'Hạn mức thưởng không hợp lệ.',
  campaignDurationMinutes: 'Thời lượng phải nằm trong khoảng 5–240 phút.',
  fareMultiplier: 'Hệ số giá phải nằm trong khoảng 1–5.',
  targetDriverCount: 'Số tài xế mục tiêu phải từ 1 trở lên.',
  zoneTripBonus: 'Thưởng mỗi chuyến không được là số âm.',
}

function displayFieldError(errors: FieldErrors, field: string) {
  const message = errors[field]
  if (!message) return undefined
  return /[À-ỹ]/.test(message) ? message : fallbackMessages[field] ?? 'Giá trị không hợp lệ.'
}

function initialRequest(plan: Proposal): RevisePlanRequest {
  return { moveQuantities: Object.fromEntries(plan.moves.map((move) => [move.id, move.quantity])), moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, move.sourceZoneId])), targetDriverCount: plan.targetDriverCount, campaignDurationMinutes: plan.campaignDurationMinutes, relocationBonus: plan.relocationBonus, zoneTripBonus: plan.zoneTripBonus, fareMultiplier: plan.fareMultiplier, budgetLimit: plan.budgetLimit, note: '' }
}

export function ProposalReviewForm({ error, isSaving, plan, onRevise }: Props) {
  const [request, setRequest] = useState(() => initialRequest(plan))
  useEffect(() => setRequest(initialRequest(plan)), [plan])
  const canEdit = plan.status === 'UnderReview' || plan.status === 'Revised'
  const setNumber = (key: 'targetDriverCount' | 'campaignDurationMinutes' | 'relocationBonus' | 'zoneTripBonus' | 'fareMultiplier' | 'budgetLimit', value: number) => setRequest((current) => ({ ...current, [key]: value }))
  const updateMove = (moveId: string, key: 'quantity' | 'source', value: number | string) => setRequest((current) => key === 'quantity' ? { ...current, moveQuantities: { ...current.moveQuantities, [moveId]: Number(value) } } : { ...current, moveSourceZoneIds: { ...current.moveSourceZoneIds, [moveId]: String(value) } })
  const fieldErrors = getFieldErrors(error)
  const requestError = error instanceof AppError ? error : undefined

  if (!canEdit) return <Card><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h3 className="font-semibold text-slate-950">Cấu hình phiên bản đã khóa</h3><p className="mt-1 text-sm text-slate-500">Không thể sửa sau khi đã phê duyệt hoặc từ chối.</p></div><span className="text-xs font-medium text-slate-500">Phiên bản v{plan.version}</span></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Locked label="Điều chuyển" value={`${plan.moves.reduce((sum, move) => sum + move.quantity, 0)} xe / ${plan.moves.length} lệnh`} /><Locked label="Tài xế huy động" value={`${plan.targetDriverCount} mục tiêu · ${plan.expectedOfferCount} offer`} /><Locked label="Thời lượng" value={`${plan.campaignDurationMinutes} phút`} /><Locked label="Thưởng đến vùng" value={formatCurrency(plan.relocationBonus)} /><Locked label="Thưởng mỗi chuyến" value={formatCurrency(plan.zoneTripBonus)} /><Locked label="Hệ số giá / ngân sách" value={`${formatMultiplier(plan.fareMultiplier)} · ${formatCurrency(plan.budgetLimit)}`} /></dl></Card>

  return <Card>
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h3 className="font-semibold text-slate-950">Điều chỉnh và chạy lại mô phỏng</h3><p className="mt-1 text-sm text-slate-500">Mọi thay đổi tạo phiên bản mới, chạy lại policy check và simulation trước khi được duyệt.</p></div><span className="text-xs font-medium text-slate-500">Phiên bản hiện tại: v{plan.version}</span></div>
    <fieldset className="mt-5" disabled={!canEdit || isSaving}>
      <legend className="text-sm font-semibold text-slate-800">Lệnh điều chuyển</legend>
      <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">{plan.moves.map((move, index) => { const selectedSource = plan.candidateSourceZones.find((zone) => zone.zoneId === request.moveSourceZoneIds[move.id]); const sourceError = displayFieldError(fieldErrors, `sourcePlan.moves.${index}.from_zone`); const quantityError = displayFieldError(fieldErrors, `sourcePlan.moves.${index}.drivers`); return <div key={move.id} className="grid gap-3 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px]">
        <div><FieldLabel htmlFor={`source-${move.id}`}>Vùng nguồn</FieldLabel><Select aria-describedby={sourceError ? `source-${move.id}-error` : undefined} aria-invalid={Boolean(sourceError)} id={`source-${move.id}`} value={request.moveSourceZoneIds[move.id]} onChange={(event) => updateMove(move.id, 'source', event.target.value)}>{plan.candidateSourceZones.map((zone) => <option key={zone.zoneId} value={zone.zoneId}>{zone.label} · khả dụng {zone.availableSupply} xe</option>)}</Select><FieldError id={`source-${move.id}-error`} message={sourceError} /></div>
        <div><FieldLabel htmlFor={`quantity-${move.id}`}>Số xe</FieldLabel><Input aria-describedby={quantityError ? `quantity-${move.id}-error` : undefined} aria-invalid={Boolean(quantityError)} id={`quantity-${move.id}`} min="0" max="12" type="number" value={request.moveQuantities[move.id] ?? 0} onChange={(event) => updateMove(move.id, 'quantity', event.target.value)} /><FieldError id={`quantity-${move.id}-error`} message={quantityError} /></div>
        <div><p className="text-sm font-medium text-slate-700">Đích / ETA</p><p className="mt-2 text-sm text-slate-900">{move.targetZoneLabel}</p><p className="text-xs text-slate-500">~{selectedSource?.etaMinutes ?? move.etaMinutes} phút</p></div>
      </div>})}</div>
      <legend className="mt-5 text-sm font-semibold text-slate-800">Tham số campaign</legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField error={displayFieldError(fieldErrors, 'targetDriverCount')} id="target" label="Tài xế mục tiêu" min={1} value={request.targetDriverCount} onChange={(value) => setNumber('targetDriverCount', value)} />
        <NumberField error={displayFieldError(fieldErrors, 'campaignDurationMinutes')} id="duration" label="Thời lượng (phút)" min={15} step={15} value={request.campaignDurationMinutes} onChange={(value) => setNumber('campaignDurationMinutes', value)} />
        <NumberField error={displayFieldError(fieldErrors, 'fareMultiplier')} id="fare" label="Hệ số giá khách hàng" min={1} max={1.2} step={0.05} value={request.fareMultiplier} onChange={(value) => setNumber('fareMultiplier', value)} />
        <NumberField error={displayFieldError(fieldErrors, 'bonusAmount')} id="relocation-bonus" label="Thưởng đến vùng" min={0} step={5_000} value={request.relocationBonus} onChange={(value) => setNumber('relocationBonus', value)} />
        <NumberField error={displayFieldError(fieldErrors, 'zoneTripBonus')} id="trip-bonus" label="Thưởng mỗi chuyến" min={0} step={5_000} value={request.zoneTripBonus} onChange={(value) => setNumber('zoneTripBonus', value)} />
        <NumberField error={displayFieldError(fieldErrors, 'budgetLimit')} id="budget" label="Hạn mức thưởng" min={0} step={100_000} value={request.budgetLimit} onChange={(value) => setNumber('budgetLimit', value)} />
      </div>
      <div className="mt-4"><FieldLabel htmlFor="revision-note">Lý do chỉnh sửa</FieldLabel><Textarea id="revision-note" rows={3} value={request.note} onChange={(event) => setRequest((current) => ({ ...current, note: event.target.value }))} placeholder="Ví dụ: giảm số xe lấy từ Cầu Giấy để giữ cung vùng nguồn" /></div>
      {requestError && <p className="mt-3 text-sm text-rose-700" role="alert">{requestError.message}{requestError.requestId ? ` Mã yêu cầu: ${requestError.requestId}.` : ''}</p>}
      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-slate-500">Kết quả được Simulator tính lại từ snapshot hiện tại trước khi cho phép duyệt.</p><Button disabled={!request.note.trim()} isLoading={isSaving} onClick={() => onRevise(request)}><RefreshCw className="size-4" />Lưu v{plan.version + 1} & chạy lại</Button></div>
    </fieldset>
  </Card>
}

function NumberField({ error, id, label, max, min, onChange, step, value }: { error?: string | undefined; id: string; label: string; max?: number; min: number; onChange: (value: number) => void; step?: number; value: number }) {
  return <div><FieldLabel htmlFor={id}>{label}</FieldLabel><Input aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} id={id} max={max} min={min} step={step} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /><FieldError id={`${id}-error`} message={error} /></div>
}
function FieldError({ id, message }: { id: string; message?: string | undefined }) { return message ? <p className="mt-1 text-xs text-rose-700" id={id}>{message}</p> : null }
function Locked({ label, value }: { label: string; value: string }) { return <div className="border-b border-slate-200 py-3 last:border-b-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div> }
