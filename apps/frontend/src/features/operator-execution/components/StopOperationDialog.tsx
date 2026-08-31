import { useState } from 'react'

import { Button } from '@/shared/components/ui/Button'
import { Dialog } from '@/shared/components/ui/Dialog'

type StopOperationDialogProps = {
  error: string | undefined
  isOpen: boolean
  isSaving: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  title: string
}

export function StopOperationDialog({ error, isOpen, isSaving, onClose, onConfirm, title }: StopOperationDialogProps) {
  const [reason, setReason] = useState('')
  const close = () => { if (!isSaving) { setReason(''); onClose() } }
  return <Dialog isOpen={isOpen} onClose={close} title={title}>
    <p className="nf-stop-dialog__description text-sm text-slate-600">Các lệnh chưa hoàn tất sẽ được dừng và hành động này được ghi vào nhật ký.</p>
    <label className="nf-stop-dialog__label mt-4 block text-sm font-semibold text-slate-800" htmlFor="stop-operation-reason">Lý do dừng</label>
    <textarea className="nf-stop-dialog__textarea mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none" id="stop-operation-reason" onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: quá ETA và chưa nhận được telemetry" value={reason} />
    {error && <p className="nf-stop-dialog__error mt-2 text-sm text-rose-700" role="alert">{error}</p>}
    <div className="nf-stop-dialog__actions mt-4 flex justify-end gap-2"><Button className="nf-stop-dialog__keep" disabled={isSaving} onClick={close} variant="ghost">Giữ vận hành</Button><Button className="nf-stop-dialog__confirm" disabled={reason.trim().length < 3} isLoading={isSaving} onClick={() => onConfirm(reason.trim())} variant="danger">Dừng phương án</Button></div>
  </Dialog>
}
