import { Check, LoaderCircle, X } from "lucide-react";

import type { DispatchBatch, Proposal } from "@/features/operator-data";
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
  const assigned = plan.moves.reduce((sum, move) => sum + move.quantity, 0);

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
        <strong>{isComplete ? "100%" : `${Math.max(15, Math.round(100 / Math.max(1, plan.moves.length)))}%`}</strong>
        <span>{assigned} xe trong {plan.moves.length} lượt điều chuyển<br />còn thiếu {formatNumber(relocation.residualGap)} xe theo model</span>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>TRẠNG THÁI TỪNG LƯỢT</h3>
        {plan.moves.map((move, index) => {
          const execution = batch?.moves.find((candidate) => candidate.sourceMoveKey === move.id)
          const complete = execution?.state === 'AVAILABLE'
          const failed = execution?.state === 'FAILED'
          return (
          <article className="nf-execution-move" key={move.id}>
            <i>{complete ? <Check size={12} /> : failed ? <X size={12} /> : index === 0 ? <LoaderCircle className="animate-spin" size={12} /> : index + 1}</i>
            <div><b>{move.sourceZoneLabel} → {move.targetZoneLabel}</b><small>{move.quantity} xe · ETA {move.etaMinutes}′ · {move.distanceKm.toFixed(1)} km</small></div>
            <strong>{execution?.state ?? (isComplete ? "AVAILABLE" : index === 0 ? "EN_ROUTE" : "SENT")}</strong>
            {failed && batch && onRetryMove ? <button className="btn btn-secondary" onClick={() => onRetryMove(batch.id, execution.id)} type="button">Thá»­ láº¡i</button> : null}
          </article>
        )})}
        <h3>KẾT QUẢ SAU ĐIỀU CHUYỂN</h3>
        <table className="table"><tbody>
          <tr><td>Thiếu hụt trước</td><td>{formatNumber(plan.metricsBefore.residualGap)} xe</td></tr>
          <tr><td>Thiếu hụt còn lại</td><td>{batch?.reconciliations[0]?.residualGap == null ? 'Chờ snapshot fresh' : `${formatNumber(batch.reconciliations[0].residualGap)} xe`}</td></tr>
          <tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(relocation.fulfillmentRate)}%</td></tr>
        </tbody></table>
      </div>
    </section>
  );
}
