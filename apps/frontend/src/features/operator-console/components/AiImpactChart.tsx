import { TrendingDown } from "lucide-react";

import type { Proposal } from "@/features/operator-data";
import { aiImpactOf } from "../model/aiImpact";

// "Có AI thì hơn được bao nhiêu" — ba kịch bản của FR-13 đặt cạnh nhau.
//
// Thanh đo **thiếu hụt còn lại**, nên ngắn hơn là tốt hơn; nhãn ghi rõ điều đó thay vì bắt
// người đọc tự suy. Kịch bản kích hoạt gắn dấu "kỳ vọng" vì nó dựa trên giả định tỷ lệ nhận
// (C-07), không phải kết quả đã đo.

export function AiImpactChart({ plan }: { plan: Proposal | undefined }) {
  const impact = aiImpactOf(plan);

  if (!impact) {
    return (
      <section aria-label="Tác động của AI" className="nf-impact-block">
        <div className="nf-rail-title">
          <span>TÁC ĐỘNG CỦA AI</span>
        </div>
        <p className="nf-panel-empty">Chạy dự báo và tạo phương án để so ba kịch bản.</p>
      </section>
    );
  }

  const worst = Math.max(...impact.scenarios.map((scenario) => scenario.residualGap), 1);

  return (
    <section aria-label="Tác động của AI" className="nf-impact-block">
      <div className="nf-rail-title">
        <span>TÁC ĐỘNG CỦA AI</span>
        <small>THIẾU HỤT CÒN LẠI · NGẮN HƠN LÀ TỐT</small>
      </div>

      <p className="nf-impact-headline">
        <TrendingDown size={15} />
        <b>−{impact.gapClosed} xe</b>
        <span>thiếu hụt được bù ({impact.gapClosedPct}%)</span>
      </p>

      <ul className="nf-impact-bars">
        {impact.scenarios.map((scenario) => (
          <li key={scenario.id}>
            <span className="nf-impact-bars__label">
              {scenario.label}
              {scenario.isProjected && <em title="Dựa trên giả định tỷ lệ nhận, chưa phải kết quả đo">kỳ vọng</em>}
            </span>
            <span className="nf-impact-bars__track">
              <i
                className={`is-${scenario.id}`}
                style={{ width: `${Math.max(3, (scenario.residualGap / worst) * 100)}%` }}
              />
            </span>
            <b>{scenario.residualGap}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
