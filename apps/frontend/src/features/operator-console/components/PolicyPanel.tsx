import { Lock, RotateCcw, TriangleAlert } from "lucide-react";

import type { PolicyMetrics, PolicyOverrides, PolicyRule } from "@/features/operator-data";
import {
  formatRuleValue,
  pendingOverrides,
  policyGroups,
  sliderRange,
  snapToStep,
} from "../model/policyControls";

// Bảng chỉ số chính sách ở cột chỉ huy — thay cho bảng TIẾN TRÌNH HỆ THỐNG cũ.
//
// Vì sao đổi: bảng tiến trình kể lại 12 bước mà hệ thống VỪA làm xong, tức là thông tin
// người vận hành đã thấy kết quả ở bản đồ và ở nút hành động. Chỗ này đắt hơn thế — nó
// nên trả lời câu hỏi mà không màn nào khác trả lời được: "phương án tiếp theo sẽ được
// tính dưới ngưỡng nào, và tôi đổi được cái nào?"
//
// RANH GIỚI QUAN TRỌNG NHẤT của màn này: giá trị chỉnh ở đây áp cho ĐÚNG lượt tính tiếp
// theo. Nó KHÔNG ghi vào `config/policy.yaml` — §13.2 bắt mọi thay đổi giá trị phải qua
// owner Data/BA hoặc PM. Câu đó phải nằm trên màn hình, không chỉ trong comment này: một
// điều phối viên tưởng mình vừa đổi chính sách của cả hệ thống là một hiểu nhầm tốn tiền.

export function PolicyPanel({ draft, metrics, isLoading, hasError, onChange, onReset }: {
  draft: PolicyOverrides
  metrics: PolicyMetrics | undefined
  isLoading: boolean
  hasError: boolean
  onChange: (key: string, value: number) => void
  onReset: () => void
}) {
  if (hasError || (!metrics && !isLoading)) {
    // Không bịa ngưỡng mặc định để lấp chỗ trống: một bảng đầy số sai nguy hiểm hơn hẳn
    // một bảng trống nói rõ là chưa đọc được.
    return (
      <div className="nf-policy">
        <div className="nf-rail-title"><span>CHỈ SỐ CHÍNH SÁCH</span></div>
        <p className="nf-policy-empty" role="status">
          <TriangleAlert size={13} />
          Chưa đọc được bộ ngưỡng từ AI service. Lượt tính tiếp theo vẫn chạy bằng
          <code> policy.yaml</code> trên máy chủ.
        </p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="nf-policy">
        <div className="nf-rail-title"><span>CHỈ SỐ CHÍNH SÁCH</span></div>
        <p className="nf-policy-empty" role="status">Đang đọc ngưỡng vận hành…</p>
      </div>
    );
  }

  const pending = pendingOverrides(metrics, draft);
  const changedCount = Object.keys(pending).length;

  return (
    <section aria-label="Chỉ số chính sách" className="nf-policy nf-scroll">
      <div className="nf-rail-title">
        <span>CHỈ SỐ CHÍNH SÁCH</span>
        {changedCount > 0 && <b className="nf-policy-badge">{changedCount} ĐÃ CHỈNH</b>}
        <small>v{metrics.version}</small>
      </div>

      <p className="nf-policy-scope">
        Giá trị chỉnh ở đây áp cho <b>lượt tính tiếp theo</b>. Không ghi vào <code>policy.yaml</code>
        {" "}— đổi ngưỡng chính thức cần owner Data/BA hoặc PM duyệt.
      </p>

      {policyGroups(metrics).map((group) => (
        <div className="nf-policy-group" key={group.id}>
          <h4>{group.label}</h4>
          {group.rules.map((rule) => (
            <PolicyRow
              draftValue={draft[rule.key]}
              key={rule.key}
              onChange={onChange}
              rule={rule}
            />
          ))}
        </div>
      ))}

      <button
        className="nf-policy-reset"
        disabled={changedCount === 0}
        onClick={onReset}
        type="button"
      >
        <RotateCcw size={11} />
        Đặt lại theo policy.yaml
      </button>
    </section>
  );
}

function PolicyRow({ draftValue, onChange, rule }: {
  draftValue: number | undefined
  onChange: (key: string, value: number) => void
  rule: PolicyRule
}) {
  const base = typeof rule.value === "number" ? rule.value : undefined;
  const current = draftValue ?? base;
  const isChanged = base !== undefined && current !== undefined && current !== base;
  const inputId = `nf-policy-${rule.key}`;

  return (
    <div className={`nf-policy-row ${isChanged ? "is-changed" : ""}`}>
      <div className="nf-policy-row__head">
        <label htmlFor={rule.tunable ? inputId : undefined}>
          {policyLabel[rule.key] ?? rule.key}
          {!rule.tunable && <Lock aria-label="Không chỉnh được" size={9} />}
        </label>
        <output htmlFor={rule.tunable ? inputId : undefined}>
          {formatRuleValue(rule, current ?? rule.value)}
        </output>
      </div>

      {rule.tunable && base !== undefined ? (
        <>
          <input
            aria-describedby={`${inputId}-note`}
            id={inputId}
            max={sliderRange(rule).max}
            min={sliderRange(rule).min}
            onChange={(event) => onChange(rule.key, snapToStep(Number(event.target.value), sliderRange(rule)))}
            step={sliderRange(rule).step}
            type="range"
            value={current}
          />
          <p className="nf-policy-row__note" id={`${inputId}-note`}>
            {isChanged
              ? <b>Gốc {formatRuleValue(rule, base)} · áp ở lượt tính tiếp theo</b>
              : <>{rule.assumption ? `${rule.assumption} · ` : ""}{rule.verified ? "đã chốt" : `chờ ${rule.owner ?? "owner"} chốt`}</>}
          </p>
        </>
      ) : (
        <p className="nf-policy-row__note" id={`${inputId}-note`}>
          {rule.verified
            // Khoá vì đã qua owner, không phải vì kỹ thuật — nói đúng lý do thì người dùng
            // biết phải hỏi ai, thay vì tưởng giao diện hỏng.
            ? `Đã chốt bởi ${rule.owner ?? "Data/BA"} — đổi cần owner duyệt`
            : "Đổi cấu trúc bài toán, không chỉnh tại chỗ"}
        </p>
      )}
    </div>
  );
}

// Nhãn tiếng Việt cho người vận hành. Key kỹ thuật giữ nguyên ở `policy.yaml` và trong
// request, nên hai bên vẫn tra được nhau; chỉ lớp hiển thị là dịch.
const policyLabel: Record<string, string> = {
  min_supply_per_zone: "Xe tối thiểu mỗi zone",
  budget_cap: "Ngân sách điều chuyển",
  max_distance: "Cự ly điều chuyển tối đa",
  max_supply_move_pct: "Tỷ lệ xe được rút khỏi zone",
  cooldown_minutes: "Thời gian chờ giữa hai lệnh",
  priority_zones: "Zone ưu tiên",
  deadhead_cost_per_km: "Chi phí xe rỗng",
  avg_vehicle_speed_kmh: "Tốc độ di chuyển trung bình",
  incentive_budget_cap: "Ngân sách thưởng",
  incentive_base: "Thưởng cơ bản mỗi offer",
  incentive_per_km: "Thưởng theo cự ly",
  incentive_max_per_offer: "Trần thưởng một offer",
  activation_radius_km: "Bán kính tìm tài xế",
  offer_ttl_minutes: "Thời hạn offer",
  max_offers_per_driver_per_hour: "Offer tối đa mỗi tài xế/giờ",
  overbooking_factor: "Hệ số gửi dư offer",
  assumed_accept_rate: "Tỷ lệ nhận giả định",
  min_idle_before_activation: "Xe rỗi tối thiểu trước kích hoạt",
  conservative_gap_mode: "Chế độ tính thiếu hụt",
  zone_risk_gap_thresholds: "Thang rủi ro zone",
};
