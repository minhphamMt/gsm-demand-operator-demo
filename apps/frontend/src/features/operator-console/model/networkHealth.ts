import { hasOperationalObservation, type Severity, type Snapshot, type Zone } from "@/features/operator-data";

// Chỉ số sức khỏe toàn mạng lưới cho cột giám sát, tính từ **đúng snapshot đang hiển thị**.
//
// Mọi số ở đây đều là số đã có sẵn trong contract — không nội suy, không dựng chuỗi thời gian.
// Ba vòng tròn cố ý **không** sao chép bộ ba của bản mock v2 ("Độ phủ nguồn xe / Độ ổn định /
// Độ tin cậy AI"): hệ thống không đo "độ ổn định", còn "độ tin cậy AI" đang bị chặn bởi MA-Q3
// (chưa chốt công thức). Gán bừa một con số cho hai ô đó là bịa chỉ số.

export type NetworkGauge = {
  detail: string
  id: "fulfillment" | "balanced" | "coverage"
  label: string
  percent: number
}

export type RiskBucket = { count: number; label: string; severity: Severity }

// Thứ tự nặng dần, để thanh phân bố luôn đọc từ an toàn sang nguy cấp.
const severityOrder: readonly Severity[] = ["Low", "Medium", "High", "Critical"];

const severityLabel: Record<Severity, string> = {
  Low: "Ổn định",
  Medium: "Theo dõi",
  High: "Bất thường",
  Critical: "Thiếu xe",
};

/** Zone được coi là còn trong tầm kiểm soát. `High`/`Critical` là phần cần can thiệp. */
const isSettled = (severity: Severity) => severity === "Low" || severity === "Medium";

export function riskDistribution(zones: readonly Zone[]): readonly RiskBucket[] {
  const observed = zones.filter(hasOperationalObservation);
  return severityOrder.map((severity) => ({
    count: observed.filter((zone) => zone.severity === severity).length,
    label: severityLabel[severity],
    severity,
  }));
}

export function networkGauges(snapshot: Snapshot, zoneContractSize = 30): readonly NetworkGauge[] {
  const observed = snapshot.zones.filter(hasOperationalObservation);
  const settled = observed.filter((zone) => isSettled(zone.severity as Severity)).length;

  return [
    {
      detail: `${snapshot.kpis.residualGap} xe còn thiếu`,
      id: "fulfillment",
      label: "Tỷ lệ đáp ứng",
      percent: clampPercent(snapshot.kpis.fulfillmentRate),
    },
    {
      detail: `${settled}/${observed.length} zone`,
      id: "balanced",
      label: "Zone trong tầm",
      percent: observed.length ? clampPercent((settled / observed.length) * 100) : 0,
    },
    {
      // Độ phủ dữ liệu là điều kiện để chạy model (console chặn dự báo khi thiếu zone),
      // nên nó thuộc nhóm "sức khỏe hệ thống" chứ không phải chỉ số vận hành.
      detail: `${observed.length}/${zoneContractSize} zone có quan sát`,
      id: "coverage",
      label: "Độ phủ dữ liệu",
      percent: clampPercent((observed.length / zoneContractSize) * 100),
    },
  ];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
