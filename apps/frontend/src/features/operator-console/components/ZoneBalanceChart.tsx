import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Zone } from "@/features/operator-data";
import { zoneBalanceRows } from "../model/zoneBalanceRows";

// Thiếu/dư xe theo zone, lấy thẳng từ snapshot đang hiển thị.
//
// Cố ý **không** vẽ đường xu hướng 24 giờ như bản mock: contract chỉ trả một snapshot tại một
// thời điểm (`ReplayTimelineStep` chỉ mang `meanRainMmH`), nên chuỗi thời gian sẽ phải bịa ra.
// Biểu đồ này là dữ liệu thật của đúng mốc đang xem.

export function ZoneBalanceChart({ onSelect, zones }: {
  onSelect: (zoneId: string) => void
  zones: readonly Zone[]
}) {
  const rows = zoneBalanceRows(zones);
  if (!rows.length) {
    return <p className="nf-panel-empty">Mọi zone đang cân bằng ở mốc này.</p>;
  }

  return (
    <div aria-label="Biểu đồ thiếu và dư xe theo zone" className="nf-zone-balance-chart" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={[...rows]} layout="vertical" margin={{ bottom: 4, left: 4, right: 12, top: 4 }}>
          <XAxis axisLine={false} tick={{ fill: "var(--nf-ops-muted)", fontSize: 9 }} tickLine={false} type="number" />
          <YAxis
            axisLine={false}
            dataKey="label"
            tick={{ fill: "var(--nf-ops-muted)", fontSize: 9 }}
            tickLine={false}
            type="category"
            width={64}
          />
          <ReferenceLine stroke="var(--nf-ops-line)" x={0} />
          <Tooltip
            contentStyle={{
              background: "var(--nf-ops-surface-2)",
              border: "1px solid var(--nf-ops-line)",
              borderRadius: 8,
              color: "var(--nf-ops-ink)",
              fontSize: 11,
            }}
            cursor={{ fill: "var(--nf-ops-hover-wash)" }}
            formatter={(value) => {
              const gap = Number(value);
              return [`${gap > 0 ? "thiếu" : "dư"} ${Math.abs(gap)} xe`, "Chênh lệch"];
            }}
          />
          <Bar dataKey="gap" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {rows.map((row) => (
              <Cell
                cursor="pointer"
                fill={row.gap > 0 ? "var(--nf-ops-red)" : "var(--nf-ops-teal)"}
                key={row.id}
                onClick={() => onSelect(row.id)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
