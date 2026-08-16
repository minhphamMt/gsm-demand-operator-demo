import { Check, LoaderCircle, X } from "lucide-react";

import { dispatchMoveLabel, dispatchProgress } from "@/features/operator-data";
import type { DispatchBatch, DispatchMove, Move, Proposal } from "@/features/operator-data";
import { formatNumber } from "@/shared/lib/format";

type ExecutionDrawerProps = {
  isComplete: boolean;
  batch?: DispatchBatch | undefined;
  onClose: () => void;
  onRetryMove?: ((batchId: string, moveId: string) => void) | undefined;
  plan: Proposal;
};

export function ExecutionDrawer({ batch, isComplete, onClose, onRetryMove, plan }: ExecutionDrawerProps) {
  const relocation = plan.metricsAfterRelocation ?? plan.metrics;
  const progress = batch ? dispatchProgress(batch) : undefined;
  const actualMoves = batch?.moves ?? [];
  const latestReconciliation = batch?.reconciliations[0];
  const verifiedResidual = isComplete && latestReconciliation?.isSnapshotFresh
    ? latestReconciliation.residualGap
    : null;

  const sourceMoveFor = (execution: DispatchMove, index: number): Move | undefined => {
    const exact = plan.moves.find((move) => move.id === execution.sourceMoveKey);
    if (exact) return exact;
    const legacy = plan.moves[index];
    if (
      legacy
      && Number(legacy.sourceZoneId.replace(/^AI-Z/i, "")) === execution.sourceZoneId
      && Number(legacy.targetZoneId.replace(/^AI-Z/i, "")) === execution.targetZoneId
    ) return legacy;
    return plan.moves.find((move) =>
      Number(move.sourceZoneId.replace(/^AI-Z/i, "")) === execution.sourceZoneId
      && Number(move.targetZoneId.replace(/^AI-Z/i, "")) === execution.targetZoneId,
    );
  };

  return (
    <section aria-label="Theo dõi thực hiện điều chuyển" className="nf-plan-drawer">
      <header>
        <div>
          <small>THỰC HIỆN · PHƯƠNG ÁN ĐÃ DUYỆT</small>
          <strong>{isComplete ? "Đã hoàn tất điều chuyển" : "Đang phát và theo dõi lệnh"}</strong>
          <p>{isComplete ? "Kết quả tồn dư được lấy từ reconciliation planned-vs-actual mới nhất." : "Từng lượt chuyển được theo dõi bằng telemetry thực, không suy hoàn tất từ lúc gửi lệnh."}</p>
        </div>
        <button aria-label="Đóng theo dõi thực hiện" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="nf-plan-summary">
        <strong>{progress ? `${progress.completionPercent}%` : "0%"}</strong>
        <span>{progress
          ? <>{progress.availableUnits}/{progress.plannedUnits} xe đã AVAILABLE · {progress.finishedMoves}/{progress.totalMoves} lượt đã kết thúc<br />còn thiếu {formatNumber(relocation.residualGap)} xe theo model</>
          : <>Chưa nhận được batch thực thi từ máy chủ<br />không giả lập trạng thái trên giao diện</>}</span>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>TRẠNG THÁI TỪNG LƯỢT</h3>
        {actualMoves.length === 0 && <p className="nf-activation-plan">Chưa có dispatch move trong batch. Hệ thống đang chờ bước phát lệnh.</p>}
        {actualMoves.map((execution, index) => {
          const move = sourceMoveFor(execution, index);
          const complete = execution.state === 'AVAILABLE';
          const failed = execution.state === 'FAILED';
          const active = ['SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED'].includes(execution.state);
          return (
          <article className="nf-execution-move" key={execution.id}>
            <i>{complete ? <Check size={12} /> : failed ? <X size={12} /> : active ? <LoaderCircle className="animate-spin" size={12} /> : index + 1}</i>
            <div><b>{move?.sourceZoneLabel ?? `Vùng ${execution.sourceZoneId}`} → {move?.targetZoneLabel ?? `Vùng ${execution.targetZoneId}`}</b><small>{execution.plannedUnits} xe · ETA {formatNumber(execution.etaMinutes)}′ · {execution.distanceKm.toFixed(1)} km</small></div>
            <strong>{dispatchMoveLabel(execution.state)}</strong>
            {failed && batch && onRetryMove ? <button className="btn btn-secondary" onClick={() => onRetryMove(batch.id, execution.id)} type="button">Thử lại</button> : null}
          </article>
        )})}
        <h3>KẾT QUẢ SAU ĐIỀU CHUYỂN</h3>
        <table className="table"><tbody>
          <tr><td>Thiếu hụt trước</td><td>{formatNumber(plan.metricsBefore.residualGap)} xe</td></tr>
          <tr><td>Thiếu hụt còn lại</td><td>{verifiedResidual == null ? 'Chờ xe AVAILABLE và snapshot fresh' : `${formatNumber(verifiedResidual)} xe`}</td></tr>
          <tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(relocation.fulfillmentRate)}%</td></tr>
        </tbody></table>
      </div>
    </section>
  );
}
