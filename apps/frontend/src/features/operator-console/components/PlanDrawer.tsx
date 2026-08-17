import { LoaderCircle, Minus, Plus, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Proposal, RevisePlanRequest } from '@/features/operator-data'
import { createRevisionRequest, initialMoveQuantities, moveQuantityLimit, previewPlanRevision } from '@/features/operator-console/model/planRevision'
import { formatCurrency, formatNumber } from '@/shared/lib/format'

type PlanDrawerProps = {
  error: Error | null
  isSaving: boolean
  onClose: () => void
  onRevise: (request: RevisePlanRequest) => void
  plan: Proposal
}

const formatWait = (minutes: number) => minutes > 0 ? `${formatNumber(minutes)}′` : '—'

export function PlanDrawer({ error, isSaving, onClose, onRevise, plan }: PlanDrawerProps) {
  const [quantities, setQuantities] = useState(() => initialMoveQuantities(plan))
  useEffect(() => setQuantities(initialMoveQuantities(plan)), [plan])
  const hasDirectMoves = plan.moves.length > 0
  const hasActivation = plan.targetDriverCount > 0
  const hasOperationalAction = hasDirectMoves || hasActivation
  const canEdit = plan.status === 'UnderReview' || plan.status === 'Revised'
  const preview = previewPlanRevision(plan, quantities)
  const planModeLabel = !hasOperationalAction
    ? 'không có hành động khả thi'
    : plan.planMode === 'ACTIVATION_ONLY'
      ? 'chỉ activation'
      : plan.planMode === 'HYBRID'
        ? 'điều chuyển kết hợp activation'
        : 'điều chuyển'

  const adjustMove = (moveId: string, delta: number) => {
    setQuantities((current) => {
      const move = plan.moves.find((candidate) => candidate.id === moveId)
      if (!move) return current
      const quantity = current[moveId] ?? move.quantity
      const limit = moveQuantityLimit(plan, current, moveId)
      return { ...current, [moveId]: Math.max(0, Math.min(limit, quantity + delta)) }
    })
  }

  return <section aria-label="Chi tiết phương án" className="nf-plan-drawer">
    <header>
      <div>
        <small>BẢNG CHI TIẾT · {hasDirectMoves ? `${preview.activeMoves} LƯỢT CHUYỂN` : 'KHÔNG CÓ LỜI GIẢI ĐIỀU CHUYỂN'}</small>
        <strong>{plan.status === 'Approved' ? 'Đã phê duyệt' : `Phương án đề xuất · v${plan.version}`}</strong>
        <p>Chế độ: {planModeLabel} · {plan.status === 'Approved' ? 'chưa có lệnh nào được phát. Thực hiện là một thao tác riêng.' : hasOperationalAction ? 'điều chỉnh số xe, lưu phiên bản mới rồi phê duyệt.' : 'kết quả này chỉ được lưu để truy vết, không thể phê duyệt.'}</p>
      </div>
      <button aria-label="Đóng bảng chi tiết" onClick={onClose} type="button"><X size={17} /></button>
    </header>
    <div aria-live="polite" className="nf-plan-summary">
      <strong>{hasOperationalAction ? `${preview.coverage}%` : '—'}</strong>
      <span>{hasOperationalAction ? <>thiếu hụt dự kiến được phủ bởi điều chuyển<br />{preview.activeMoves} lượt chuyển · còn thiếu {formatNumber(preview.residualGap)} xe</> : <>Không có phương án điều phối để tính hiệu quả<br />Không phát hiện hotspot và nguồn dư đồng thời đạt ngưỡng policy</>}</span>
    </div>
    <div className="nf-plan-metrics">
      <span><small>CHUYỂN TRỰC TIẾP</small><b>{hasOperationalAction ? preview.activeMoves : '—'}</b></span>
      <span><small>CHI PHÍ</small><b>{hasOperationalAction ? formatCurrency(preview.estimatedCost) : '—'}</b></span>
      <span><small>ETA TỐI ĐA</small><b>{hasOperationalAction ? `${Math.max(0, ...plan.moves.filter((move) => (quantities[move.id] ?? move.quantity) > 0).map((move) => move.etaMinutes))}′` : '—'}</b></span>
    </div>
    <div className="nf-plan-scroll nf-scroll">
      {hasOperationalAction && <><h3>TÁC ĐỘNG DỰ KIẾN</h3>
      <table className="table">
        <thead><tr><th>Chỉ số</th><th>Không hành động</th><th>Sau điều phối</th></tr></thead>
        <tbody>
          <tr><td>Thiếu hụt</td><td>{formatNumber(plan.metricsBefore.residualGap)}</td><td>{formatNumber(preview.residualGap)}</td></tr>
          <tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(plan.metricsBefore.fulfillmentRate)}%</td><td>{formatNumber(preview.fulfillmentRate)}%</td></tr>
          <tr><td>Phút chờ trung bình</td><td>{formatWait(plan.metricsBefore.avgWaitProxy)}</td><td>{formatWait(plan.metrics.avgWaitProxy)}</td></tr>
        </tbody>
      </table></>}
      <h3>RÀNG BUỘC VẬN HÀNH</h3>
      <div className="nf-policy-tags">
        {plan.policyChecks.map((check) => <span className={check.passed ? 'pass' : 'fail'} key={check.id}>{check.passed ? '✓' : '!'} {check.label}</span>)}
      </div>
      {(plan.forecastRunId || plan.modelInputId) && <>
        <h3>TRUY XUẤT QUYẾT ĐỊNH</h3>
        <dl className="nf-assumptions">
          <dt>ForecastRun</dt><dd>{plan.forecastRunId ?? 'Không xác định'}</dd>
          <dt>Model input</dt><dd>{plan.modelInputId ?? 'Không xác định'}</dd>
          <dt>Snapshot</dt><dd>{plan.inputSnapshotId}</dd>
        </dl>
      </>}
      {plan.warnings.length > 0 && <>
        <h3>CẢNH BÁO CHÍNH SÁCH</h3>
        {plan.warnings.map((warning) => <p className="nf-warning" key={warning.id}>! {warning.title}: {warning.detail}</p>)}
      </>}
      <h3>{hasDirectMoves ? `LƯỢT ĐIỀU CHUYỂN ${canEdit ? 'ĐỀ XUẤT' : 'ĐÃ DUYỆT'}` : 'NGUYÊN NHÂN KHÔNG CÓ LỜI GIẢI'}</h3>
      {!hasDirectMoves && <p className="nf-activation-plan">{hasActivation ? 'Không có zone dư an toàn để rút xe; phương án dùng activation tài xế.' : 'Không có hotspot và zone dư an toàn cùng đạt ngưỡng policy. Không có lệnh điều chuyển hay activation nào được tạo.'} Chưa có offer nào được gửi.</p>}
      {plan.moves.map((move, index) => {
        const quantity = quantities[move.id] ?? move.quantity
        const limit = moveQuantityLimit(plan, quantities, move.id)
        return <article className={`nf-move ${quantity === 0 ? 'is-disabled' : ''}`} key={move.id}>
          <span>MV-{String(index + 1).padStart(2, '0')}</span>
          <div>
            <b>{move.sourceZoneLabel} → {move.targetZoneLabel}</b>
            <small>{move.distanceKm.toFixed(1)} km · ETA {move.etaMinutes}′ · {formatCurrency(move.estimatedCost)}</small>
            <details><summary>Vì sao?</summary><p>Model chọn nguồn này vì nằm trong bán kính chính sách, ETA {move.etaMinutes} phút và chuyển {move.quantity} xe giúp giảm trực tiếp thiếu hụt tại {move.targetZoneLabel}.</p></details>
          </div>
          {canEdit ? <div className="nf-move-stepper">
            <button aria-label={`Giảm xe ${move.sourceZoneLabel} đến ${move.targetZoneLabel}`} disabled={isSaving || quantity === 0} onClick={() => adjustMove(move.id, -1)} type="button"><Minus size={13} /></button>
            <output aria-label={`Số xe ${move.sourceZoneLabel} đến ${move.targetZoneLabel}`}>{quantity}</output>
            <button aria-label={`Tăng xe ${move.sourceZoneLabel} đến ${move.targetZoneLabel}`} disabled={isSaving || quantity >= limit} onClick={() => adjustMove(move.id, 1)} type="button"><Plus size={13} /></button>
            <small>xe · tối đa {limit}</small>
          </div> : <strong>{move.quantity} xe</strong>}
        </article>
      })}
      {canEdit && hasDirectMoves && <div className="nf-plan-revision">
        <div><b>{preview.hasChanges ? `Đang chỉnh phiên bản v${plan.version + 1}` : 'Chưa thay đổi số xe'}</b><small>Mỗi lần lưu tạo một phiên bản có audit; kết quả model gốc vẫn được giữ lại.</small></div>
        <button className="btn btn-primary" disabled={!preview.hasChanges || preview.assigned === 0 || isSaving} onClick={() => onRevise(createRevisionRequest(plan, quantities))} type="button">
          {isSaving ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />} Lưu điều chỉnh
        </button>
        {preview.assigned === 0 && <p role="alert">Phương án phải giữ ít nhất một xe điều chuyển.</p>}
        {error && <p role="alert">{error.message}</p>}
      </div>}
    </div>
  </section>
}
