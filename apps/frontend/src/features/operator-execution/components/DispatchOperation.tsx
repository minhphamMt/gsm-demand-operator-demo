import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, RotateCcw, Square } from 'lucide-react'
import { Link } from 'react-router'

import { dispatchMoveLabel, dispatchProgress, dispatchStatusPresentation, type DispatchBatch, type DispatchMove, type Proposal } from '@/features/operator-data'
import { simulatedDispatchDrivers, simulatedDriverMovementLabel, simulatedDriverStateLabels } from '@/features/operator-execution'
import { Button } from '@/shared/components/ui/Button'
import { routes } from '@/shared/config/routes'
import { formatNumber, formatTime } from '@/shared/lib/format'

type DispatchOperationProps = {
  batch: DispatchBatch
  isRefreshing: boolean
  isRetrying: boolean
  onRefresh: () => void
  onRetry: (batchId: string, moveId: string) => void
  onStop: () => void
  plan: Proposal | undefined
}

const simulatedLifecycle: readonly DispatchMove['state'][] = ['PLANNED', 'SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED', 'AVAILABLE']

export function DispatchOperation({ batch, isRefreshing, isRetrying, onRefresh, onRetry, onStop, plan }: DispatchOperationProps) {
  const status = dispatchStatusPresentation(batch)
  const progress = dispatchProgress(batch)
  const reconciliation = batch.reconciliations[0]
  return <div className="nf-operation-stack">
    {(status.isQueued || status.isOverdue) && <div className={`nf-operation-alert ${status.isOverdue ? 'is-warning' : ''}`} role={status.isOverdue ? 'alert' : 'status'}>
      {status.isOverdue ? <AlertTriangle size={18} /> : <Clock3 size={18} />}
      <div><strong>{status.label}</strong><span>{status.isOverdue ? 'Đã vượt ETA dự kiến. Hãy kiểm tra telemetry, thử lại lệnh lỗi hoặc dừng phương án.' : 'Lệnh đã lưu trong DB nhưng chưa có telemetry SENT; hệ thống không còn hiển thị giả là đang chạy.'}</span></div>
    </div>}
    <section className="nf-operation-overview">
      <div className={status.isOverdue ? 'is-overdue' : status.isQueued ? 'is-queued' : 'is-status'}><small>TRẠNG THÁI</small><strong className={status.isAnimating ? 'is-live' : ''}>{status.label}</strong><span>Phát lúc {formatTime(batch.releasedAt)}</span></div>
      <div><small>TIẾN ĐỘ LỆNH</small><strong>{progress.finishedMoves}/{progress.totalMoves}</strong><span>{progress.activeMoves} đang đi · {progress.waitingMoves} chờ</span></div>
      <div><small>XE SẴN SÀNG</small><strong>{progress.availableUnits}/{progress.plannedUnits}</strong><span>{progress.failedMoves} lệnh lỗi</span></div>
      <div><small>ĐỐI SOÁT</small><strong>{reconciliation ? `Lần ${reconciliation.revision}` : 'Đang chờ'}</strong><span>{reconciliation?.isSnapshotFresh ? 'Snapshot mới' : 'Chưa có snapshot mới'}</span></div>
    </section>
    <div className={`nf-operation-progress${status.isOverdue ? ' is-overdue' : ''}`}><span style={{ width: `${progress.completionPercent}%` }} /><b>{progress.completionPercent}% lệnh đã kết thúc</b></div>
    <div className="nf-operation-toolbar"><div><strong>{plan?.title ?? 'Phương án điều chuyển'}</strong><span>Batch {batch.id.slice(0, 8)}… · phiên bản {batch.proposalVersion}</span></div><div><Link className="btn btn-secondary" to={routes.operator.executionPlanDetail(batch.proposalId)}>Xem phương án</Link><Button onClick={onRefresh} variant="secondary"><RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={15} />Cập nhật</Button>{status.canCancel && <Button onClick={onStop} variant="danger"><Square size={14} />Dừng</Button>}</div></div>
    <section className="nf-operation-panel"><header><div><small>ĐIỀU CHUYỂN</small><h2>Trạng thái từng lệnh</h2></div><span>{progress.totalMoves} tuyến</span></header><div className="nf-operation-moves">
      {batch.moves.map((move) => {
        const source = plan?.moves.find((candidate) => candidate.id === move.sourceMoveKey)
        const sourceLabel = source?.sourceZoneLabel ?? `Vùng ${move.sourceZoneId}`
        const targetLabel = source?.targetZoneLabel ?? `Vùng ${move.targetZoneId}`
        const isFailed = move.state === 'FAILED'
        const mockDrivers = simulatedDispatchDrivers(batch.id, move)
        const lifecycleIndex = simulatedLifecycle.indexOf(move.state)
        return <article className={`nf-operation-move is-${move.state.toLowerCase()}`} key={move.id}>
          <i>{move.state === 'AVAILABLE' ? <CheckCircle2 size={16} /> : isFailed ? <AlertTriangle size={16} /> : <Clock3 size={16} />}</i>
          <div><strong>{sourceLabel} → {targetLabel}</strong><span>{move.plannedUnits} xe · {move.distanceKm.toFixed(1)} km · ETA {formatNumber(move.etaMinutes)} phút · mô phỏng tối thiểu {formatNumber(Math.max(1, move.etaMinutes - 3))} phút</span></div>
          <b>{dispatchMoveLabel(move.state)}</b>
          {lifecycleIndex >= 0 && <div aria-label="Vòng đời trạng thái mô phỏng" className="nf-operation-stage-track">
            {simulatedLifecycle.map((stage, index) => <span className={index < lifecycleIndex ? 'is-done' : index === lifecycleIndex ? 'is-current' : ''} key={stage}>{dispatchMoveLabel(stage)}</span>)}
          </div>}
          <div aria-label={`Tài xế mô phỏng của ${source?.sourceZoneLabel ?? move.sourceZoneId}`} className="nf-operation-driver-list">
            <small>TÀI XẾ MÔ PHỎNG</small>
            {mockDrivers.map((driver) => <span key={driver.id} title={`${driver.name} · ${driver.vehiclePlate} · ${simulatedDriverMovementLabel(driver, move, sourceLabel, targetLabel)}`}>
              <b>{driver.name}</b>
              <em>{driver.vehiclePlate} · {driver.profile}</em>
              <mark className={`is-${driver.state.toLowerCase()}`}>{simulatedDriverStateLabels[driver.state]}</mark>
            </span>)}
          </div>
          {isFailed && <Button disabled={isRetrying} onClick={() => onRetry(batch.id, move.id)} variant="secondary"><RotateCcw size={14} />Thử lại</Button>}
        </article>
      })}
    </div></section>
    <section className="nf-operation-panel"><header><div><small>KẾT QUẢ THẬT</small><h2>Đối soát gần nhất</h2></div></header>{reconciliation ? <div className="nf-operation-reconcile"><span>Đã đến <b>{reconciliation.arrivedUnits} xe</b></span><span>Sẵn sàng <b>{reconciliation.availableUnits} xe</b></span><span>Đóng góp thực <b>{reconciliation.actualContribution} xe</b></span><span>Thiếu còn lại <b>{reconciliation.residualGap == null ? 'Chờ snapshot' : `${formatNumber(reconciliation.residualGap)} xe`}</b></span></div> : <p className="nf-operation-empty">Chưa có telemetry hợp lệ để tạo bản đối soát.</p>}</section>
  </div>
}
