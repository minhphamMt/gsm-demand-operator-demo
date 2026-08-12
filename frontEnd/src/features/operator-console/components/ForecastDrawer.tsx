import { X } from "lucide-react";

import { operationalGapFor, type Zone } from "@/features/operator-data";
import { formatNumber } from "@/shared/lib/format";

type ForecastDrawerProps = {
  dataSource?: string | null | undefined;
  forecastMode?: string | null | undefined;
  forecastTime: string;
  horizon: number;
  modelVersion?: string | null | undefined;
  onClose: () => void;
  onZoneSelect: (zoneId: string) => void;
  sourceTime: string;
  zones: readonly Zone[];
};

export function ForecastDrawer(props: ForecastDrawerProps) {
  const deficits = props.zones
    .map((zone) => ({ zone, gap: Math.max(0, zone.operationalGap ?? operationalGapFor(zone)) }))
    .filter(({ gap }) => gap >= 3)
    .sort((left, right) => right.gap - left.gap);
  const surplus = props.zones
    .map((zone) => Math.max(0, -(zone.operationalGap ?? operationalGapFor(zone))))
    .filter((gap) => gap >= 4);
  const totalDeficit = deficits.reduce((sum, item) => sum + item.gap, 0);
  const totalSurplus = surplus.reduce((sum, gap) => sum + gap, 0);
  const bandHigh = deficits.reduce((sum, { zone, gap }) => {
    const highDemand = props.horizon === 30 ? zone.demandRange30?.[1] : zone.demandRange15?.[1];
    return sum + Math.max(gap, Math.round((highDemand ?? zone.demand) - zone.supply));
  }, 0);
  const maxGap = Math.max(1, ...deficits.map((item) => item.gap));

  return (
    <section aria-label="Chi tiết kết quả dự báo" className="nf-plan-drawer">
      <header>
        <div><small>BẢNG CHI TIẾT · KẾT QUẢ TÍNH TOÁN</small><strong>Kết quả dự báo</strong>
          <p>Ước lượng tại {props.forecastTime}. Chưa có phương án điều chuyển nào được tạo.</p></div>
        <button aria-label="Đóng bảng chi tiết" onClick={props.onClose} type="button"><X size={17} /></button>
      </header>
      <div className="nf-forecast-summary">
        <div><small>THIẾU HỤT DỰ BÁO</small><strong>{formatNumber(totalDeficit)} xe</strong>
          <span>{deficits.length} zone · khoảng {formatNumber(totalDeficit)}–{formatNumber(bandHigh)} xe theo dải bất định</span></div>
        <div><small>NGUỒN DƯ KHẢ DỤNG</small><strong>{formatNumber(totalSurplus)} xe</strong>
          <span>{surplus.length} zone · sau khi giữ đệm tại nguồn</span></div>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>ĐIỂM NÓNG TẠI {props.forecastTime}</h3>
        <div className="nf-hotspot-list">
          {deficits.map(({ zone, gap }) => <button key={zone.id} onClick={() => props.onZoneSelect(zone.id)} type="button">
            <b>{zone.label}</b><i><span style={{ width: `${Math.round(gap / maxGap * 100)}%` }} /></i><strong>−{formatNumber(gap)} xe</strong>
          </button>)}
        </div>
        <h3>GIẢ ĐỊNH &amp; ĐẦU VÀO</h3>
        <dl className="nf-assumptions">
          <dt>Snapshot</dt><dd>{props.sourceTime} · 30/30 zone · dữ liệu dự án</dd>
          <dt>Horizon</dt><dd>{props.horizon} phút → {props.forecastTime}</dd>
          <dt>Model</dt><dd>{props.modelVersion ?? "Không xác định"}</dd>
          <dt>Chế độ</dt><dd>{props.forecastMode ?? "Không xác định"}</dd>
          <dt>Nguồn</dt><dd>{props.dataSource ?? "AI zone observations"}</dd>
          <dt>Bất định</dt><dd>Dải p10–p90 do model trả về cho từng zone</dd>
        </dl>
      </div>
    </section>
  );
}
