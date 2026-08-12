import { useState } from 'react'

import type { Proposal, RejectPlanRequest } from '@/features/operator-data'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'
import { FieldLabel, Select, Textarea } from '@/shared/components/ui/Field'
import { formatCurrency } from '@/shared/lib/format'

type Props = { error?: string | undefined; hasCampaign?: boolean; isWorking: boolean; plan: Proposal; onActivate: () => void; onApprove: (note: string) => void; onReject: (request: RejectPlanRequest) => void }
const checklist = ['Đã kiểm tra snapshot và hotspot đầu vào', 'Đã xem policy, cảnh báo và tác động trước/sau', 'Đã kiểm tra chi phí, ngân sách và residual gap'] as const

export function PlanDecisionActions({ error, hasCampaign = false, isWorking, plan, onActivate, onApprove, onReject }: Props) {
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'activation'>()
  const [note, setNote] = useState('')
  const [reasonCode, setReasonCode] = useState<RejectPlanRequest['reasonCode']>('budget')
  const [confirmed, setConfirmed] = useState<readonly string[]>([])
  const isReviewable = plan.status === 'UnderReview' || plan.status === 'Revised'
  const canApprove = isReviewable && plan.policyChecks.every((check) => check.passed) && new Date(plan.inputFreshUntil) >= new Date()
  const hasActivationTarget = Boolean(plan.targetZoneIds?.length || plan.targetZoneId)
  const toggleConfirmation = (item: string) => setConfirmed((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])
  const close = () => { setDialog(undefined); setConfirmed([]) }

  return <>
    <div className="flex flex-wrap gap-2">{isReviewable && <><Button variant="danger" onClick={() => setDialog('reject')}>Từ chối</Button><Button disabled={!canApprove} onClick={() => setDialog('approve')}>Phê duyệt phương án</Button></>}{plan.status === 'Approved' && !hasCampaign && <Button disabled={!hasActivationTarget} onClick={() => setDialog('activation')}>Thiết lập huy động thêm</Button>}{hasCampaign && <Badge tone="success">Campaign đã phát hành</Badge>}</div>
    {isReviewable && !canApprove && <p className="mt-2 max-w-md text-xs text-rose-700">Không thể duyệt khi snapshot hết hạn hoặc còn policy không đạt.</p>}
    {plan.status === 'Approved' && !hasCampaign && !hasActivationTarget && <p role="alert" className="mt-2 max-w-md text-xs text-rose-700">Không thể phát hành offer vì proposal chưa có vùng mục tiêu AI.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

    <Dialog isOpen={dialog === 'approve'} onClose={close} title="Xác nhận quyết định phê duyệt">
      <p className="text-sm text-slate-600">Bạn đang duyệt {plan.id} phiên bản {plan.version}. Proposal sẽ được khóa; campaign chỉ được phát hành ở bước xác nhận riêng.</p>
      <fieldset className="mt-4 space-y-3"><legend className="text-sm font-semibold text-slate-900">Checklist bắt buộc</legend>{checklist.map((item) => <label key={item} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700"><input className="mt-0.5 size-4 accent-brand-600" type="checkbox" checked={confirmed.includes(item)} onChange={() => toggleConfirmation(item)} /><span>{item}</span></label>)}</fieldset>
      <div className="mt-4"><FieldLabel htmlFor="approval-note">Ghi chú quyết định (không bắt buộc)</FieldLabel><Textarea id="approval-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho ca vận hành tiếp theo" /></div>
      <Footer confirm="Duyệt phiên bản này" disabled={confirmed.length !== checklist.length} isWorking={isWorking} onCancel={close} onConfirm={() => { onApprove(note); close(); setNote('') }} />
    </Dialog>

    <Dialog isOpen={dialog === 'reject'} onClose={close} title="Từ chối phương án">
      <FieldLabel htmlFor="reason-code">Nhóm lý do</FieldLabel><Select id="reason-code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value as RejectPlanRequest['reasonCode'])}><option value="budget">Vượt hoặc chưa tối ưu ngân sách</option><option value="source-risk">Rủi ro thiếu cung vùng nguồn</option><option value="low-impact">Tác động dự kiến chưa đủ</option><option value="stale-data">Snapshot không còn phù hợp</option><option value="other">Lý do khác</option></Select>
      <div className="mt-4"><FieldLabel htmlFor="rejection-note">Giải thích bắt buộc</FieldLabel><Textarea id="rejection-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nêu rõ căn cứ để bộ sinh đề xuất có thể cải thiện" /></div>
      <Footer confirm="Xác nhận từ chối" disabled={!note.trim()} isWorking={isWorking} onCancel={close} onConfirm={() => { onReject({ reasonCode, note }); close(); setNote('') }} />
    </Dialog>

    <Dialog isOpen={dialog === 'activation'} onClose={close} title="Xác nhận chiến dịch huy động">
      <div className="grid grid-cols-2 gap-2 text-sm"><Metric label="Còn thiếu" value={`${plan.metrics.residualGap} xe`} /><Metric label="Mục tiêu huy động" value={`${plan.targetDriverCount} xe`} /><Metric label="Offer dự kiến" value={`${plan.expectedOfferCount} lời mời`} /><Metric label="Ứng viên hiện có" value={`${plan.eligibleDriverCount} tài xế`} /><Metric label="Cam kết tối đa" value={formatCurrency(Math.min(plan.expectedOfferCount, plan.eligibleDriverCount) * plan.relocationBonus)} /><Metric label="TTL / thời lượng" value={`15 / ${plan.campaignDurationMinutes} phút`} /></div>
      {plan.eligibleDriverCount < plan.targetDriverCount && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Ứng viên hiện tại chưa đủ mục tiêu. Campaign sẽ gửi cho số ứng viên hợp lệ và tiếp tục theo dõi slot thiếu.</p>}
      <p className="mt-4 text-sm text-slate-600">Đây là quyết định ngân sách riêng. Tài xế nhận lời mời trên ứng dụng, có thể từ chối mà không bị phạt; hệ thống tự dừng gửi khi đủ slot hoặc chạm hạn mức.</p>
      <Footer confirm="Phát hành offer" isWorking={isWorking} onCancel={close} onConfirm={() => { onActivate(); close() }} />
    </Dialog>
  </>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div> }
function Footer({ confirm, disabled, isWorking, onCancel, onConfirm }: { confirm: string; disabled?: boolean; isWorking: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onCancel}>Quay lại</Button><Button disabled={disabled} isLoading={isWorking} onClick={onConfirm}>{confirm}</Button></div> }
