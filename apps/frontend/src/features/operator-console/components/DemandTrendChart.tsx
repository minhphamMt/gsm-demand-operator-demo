import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ReplayTimelineStep } from "@/features/operator-data";
import { demandTrendRows } from "../model/demandTrendRows";

// Xu hướng cầu–cung trong ngày, đọc từ cửa sổ replay của AI service.
//
// Đây là số **đã quan sát** trên dataset, không phải dự báo: cùng nguồn với snapshot đang xem,
// chỉ khác là lấy cả cửa sổ thay vì một mốc. Mốc nào thiếu tổng thì bị loại chứ không vẽ 0 —
// một điểm 0 giả giữa đường cong đọc thành "mạng lưới sập" chứ không thành "thiếu dữ liệu".

export function DemandTrendChart({ steps }: { steps: readonly ReplayTimelineStep[] }) {
  const rows = demandTrendRows(steps);
  const latest = rows[rows.length - 1];

  // Khối luôn giữ khung kể cả khi chưa có mốc nào: để nó biến mất làm cả cột nhảy chỗ mỗi lần
  // cửa sổ replay tải xong.
  if (!latest || rows.length < 2) {
    return (
      <section aria-label="Xu hướng cầu và cung trong ngày" className="nf-trend-block">
        <div className="nf-rail-title">
          <span>CẦU / CUNG TRONG NGÀY</span>
          <small>ĐÃ QUAN SÁT</small>
        </div>
        <p className="nf-panel-empty">Chưa đủ mốc quan sát để vẽ xu hướng.</p>
      </section>
    );
  }

  return (
    <section aria-label="Xu hướng cầu và cung trong ngày" className="nf-trend-block">
      <div className="nf-rail-title">
        <span>CẦU / CUNG TRONG NGÀY</span>
        <small>ĐÃ QUAN SÁT</small>
      </div>
      <p className="nf-trend-current">
        <b>{latest.demand.toLocaleString("vi-VN")}</b> cuốc
        <em>·</em>
        <b>{latest.supply.toLocaleString("vi-VN")}</b> xe
      </p>
      <div className="nf-trend-canvas" role="img" aria-label={`Biểu đồ cầu và cung theo mốc 5 phút, ${rows.length} mốc`}>
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={[...rows]} margin={{ bottom: 0, left: -26, right: 6, top: 4 }}>
            <defs>
              <linearGradient id="nf-demand-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--nf-ops-teal)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--nf-ops-teal)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--nf-ops-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={28} tick={{ fill: "var(--nf-ops-muted)", fontSize: 9 }} tickLine={false} />
            <YAxis axisLine={false} tick={{ fill: "var(--nf-ops-muted)", fontSize: 9 }} tickLine={false} width={46} />
            <Tooltip
              contentStyle={{ background: "var(--nf-ops-surface-2)", border: "1px solid var(--nf-ops-line)", borderRadius: 8, color: "var(--nf-ops-ink)", fontSize: 11 }}
              cursor={{ stroke: "var(--nf-ops-teal)", strokeDasharray: "3 3" }}
              formatter={(value, name) => [`${Number(value).toLocaleString("vi-VN")} ${name === "demand" ? "cuốc" : "xe"}`, name === "demand" ? "Cầu" : "Cung"]}
            />
            <Area dataKey="supply" dot={false} fill="none" isAnimationActive={false} stroke="var(--nf-ops-blue, #7fa9f5)" strokeDasharray="4 3" strokeWidth={1.6} type="monotone" />
            <Area dataKey="demand" dot={false} fill="url(#nf-demand-fill)" isAnimationActive={false} stroke="var(--nf-ops-teal)" strokeWidth={2} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="nf-trend-legend">
        <span><i className="is-demand" /> Cầu</span>
        <span><i className="is-supply" /> Cung</span>
      </p>
    </section>
  );
}

