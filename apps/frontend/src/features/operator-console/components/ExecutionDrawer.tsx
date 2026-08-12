import { Check, LoaderCircle, X } from "lucide-react";

import type { Proposal } from "@/features/operator-data";
import { formatNumber } from "@/shared/lib/format";

type ExecutionDrawerProps = {
  isComplete: boolean;
  onClose: () => void;
  plan: Proposal;
};

export function ExecutionDrawer({ isComplete, onClose, plan }: ExecutionDrawerProps) {
  const relocation = plan.metricsAfterRelocation ?? plan.metrics;
  const assigned = plan.moves.reduce((sum, move) => sum + move.quantity, 0);

  return (
    <section aria-label="Theo dõi thực hiện điều chuyển" className="nf-plan-drawer">
      <header>
        <div>
          <small>THỰC HIỆN · PHƯƠNG ÁN ĐÃ DUYỆT</small>
          <strong>{isComplete ? "Đã hoàn tất điều chuyển" : "Đang phát và theo dõi lệnh"}</strong>
          <p>{isComplete ? "Kết quả tồn dư được lấy từ đầu ra mô phỏng của model đã duyệt." : "Từng lượt chuyển đang được phát theo đúng nguồn, đích và số xe đã duyệt."}</p>
        </div>
        <button aria-label="Đóng theo dõi thực hiện" onClick={onClose} type="button"><X size={17} /></button>
      </header>
      <div className="nf-plan-summary">
        <strong>{isComplete ? "100%" : `${Math.max(15, Math.round(100 / Math.max(1, plan.moves.length)))}%`}</strong>
        <span>{assigned} xe trong {plan.moves.length} lượt điều chuyển<br />còn thiếu {formatNumber(relocation.residualGap)} xe theo model</span>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>TRẠNG THÁI TỪNG LƯỢT</h3>
        {plan.moves.map((move, index) => (
          <article className="nf-execution-move" key={move.id}>
            <i>{isComplete ? <Check size={12} /> : index === 0 ? <LoaderCircle className="animate-spin" size={12} /> : index + 1}</i>
            <div><b>{move.sourceZoneLabel} → {move.targetZoneLabel}</b><small>{move.quantity} xe · ETA {move.etaMinutes}′ · {move.distanceKm.toFixed(1)} km</small></div>
            <strong>{isComplete ? "HOÀN TẤT" : index === 0 ? "ĐANG ĐI" : "ĐÃ PHÁT"}</strong>
          </article>
        ))}
        <h3>KẾT QUẢ SAU ĐIỀU CHUYỂN</h3>
        <table className="table"><tbody>
          <tr><td>Thiếu hụt trước</td><td>{formatNumber(plan.metricsBefore.residualGap)} xe</td></tr>
          <tr><td>Thiếu hụt còn lại</td><td>{formatNumber(relocation.residualGap)} xe</td></tr>
          <tr><td>Tỷ lệ đáp ứng</td><td>{formatNumber(relocation.fulfillmentRate)}%</td></tr>
        </tbody></table>
      </div>
    </section>
  );
}
