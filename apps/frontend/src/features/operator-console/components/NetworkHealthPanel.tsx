import type { Snapshot } from "@/features/operator-data";
import { networkGauges, riskDistribution, type NetworkGauge, type RiskBucket } from "../model/networkHealth";

// Khối giám sát sức khỏe mạng lưới ở đầu cột trái.
//
// Vòng tròn là SVG thuần thay vì thư viện biểu đồ: chỉ có một cung tròn và một con số, kéo
// recharts vào đây là thêm một cây phụ thuộc cho thứ 20 dòng CSS làm được.

const gaugeTone: Record<NetworkGauge["id"], string> = {
  fulfillment: "var(--nf-ops-teal)",
  balanced: "var(--nf-ops-blue)",
  coverage: "var(--nf-ops-amber)",
};

const riskTone: Record<RiskBucket["severity"], string> = {
  Low: "var(--nf-ops-teal)",
  Medium: "var(--nf-ops-amber)",
  High: "#ec835a",
  Critical: "var(--nf-ops-red)",
};

export function NetworkHealthPanel({ onSelectSeverity, snapshot }: {
  onSelectSeverity?: ((severity: RiskBucket["severity"]) => void) | undefined
  snapshot: Snapshot
}) {
  const gauges = networkGauges(snapshot);
  const buckets = riskDistribution(snapshot.zones);
  const observed = buckets.reduce((total, bucket) => total + bucket.count, 0);

  return (
    <section aria-label="Sức khỏe mạng lưới" className="nf-network-health">
      <div className="nf-rail-title">
        <span>SỨC KHỎE MẠNG LƯỚI</span>
        <small>{snapshot.kpis.requests} yêu cầu · {snapshot.kpis.fleetAvailable} xe</small>
      </div>

      <div className="nf-gauge-row">
        {gauges.map((gauge) => <Gauge gauge={gauge} key={gauge.id} />)}
      </div>

      <div className="nf-risk-distribution">
        <p className="nf-risk-distribution__title">Phân bố rủi ro · {observed} zone</p>
        <div className="nf-risk-bar" role="img" aria-label={`Phân bố rủi ro: ${buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}>
          {buckets.filter((bucket) => bucket.count > 0).map((bucket) => (
            <span
              key={bucket.severity}
              style={{ background: riskTone[bucket.severity], flexGrow: bucket.count }}
              title={`${bucket.label}: ${bucket.count} zone`}
            />
          ))}
        </div>
        <ul className="nf-risk-legend">
          {buckets.map((bucket) => (
            <li key={bucket.severity}>
              {onSelectSeverity ? (
                <button onClick={() => onSelectSeverity(bucket.severity)} type="button">
                  <i style={{ background: riskTone[bucket.severity] }} />
                  <span>{bucket.label}</span>
                  <b>{bucket.count}</b>
                </button>
              ) : (
                <span className="nf-risk-legend__static">
                  <i style={{ background: riskTone[bucket.severity] }} />
                  <span>{bucket.label}</span>
                  <b>{bucket.count}</b>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Gauge({ gauge }: { gauge: NetworkGauge }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const filled = (gauge.percent / 100) * circumference;

  return (
    <div className="nf-gauge" title={gauge.detail}>
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <circle className="nf-gauge__track" cx="24" cy="24" r={radius} />
        <circle
          className="nf-gauge__value"
          cx="24"
          cy="24"
          r={radius}
          stroke={gaugeTone[gauge.id]}
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
        <text className="nf-gauge__text" dominantBaseline="central" textAnchor="middle" x="24" y="25">
          {gauge.percent}%
        </text>
      </svg>
      <strong>{gauge.label}</strong>
      <small>{gauge.detail}</small>
    </div>
  );
}
