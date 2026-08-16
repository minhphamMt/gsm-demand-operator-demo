import { X } from "lucide-react";

import { hasOperationalObservation, operationalGapFor, type ForecastRun, type Hotspot, type Zone } from "@/features/operator-data";
import { formatNumber } from "@/shared/lib/format";

type ForecastDrawerProps = {
  dataSource?: string | null | undefined;
  forecastMode?: string | null | undefined;
  forecastRun?: ForecastRun | undefined;
  forecastTime: string;
  horizon: number;
  hotspots: readonly Hotspot[];
  modelVersion?: string | null | undefined;
  onClose: () => void;
  onZoneSelect: (zoneId: string) => void;
  sourceTime: string;
  zones: readonly Zone[];
};

function demandQuantiles(zone: Zone, horizon: number) {
  const range = horizon === 5
    ? zone.demandRange5
    : horizon === 10
      ? zone.demandRange10
    : horizon === 15
      ? zone.demandRange15
      : null;
  const p50 = horizon === 5
    ? zone.forecast5
    : horizon === 10
      ? zone.forecast10
    : horizon === 15
      ? zone.forecast15
      : null;
  return { p10: range?.[0] ?? null, p50: p50 ?? null, p90: range?.[1] ?? null };
}

export function ForecastDrawer(props: ForecastDrawerProps) {
  const hotspotsByZone = new Map(props.hotspots.map((hotspot) => [hotspot.zoneId, hotspot]));
  const deficits = props.zones
    .filter(hasOperationalObservation)
    .map((zone) => ({ zone, gap: Math.max(0, zone.operationalGap ?? operationalGapFor(zone) ?? 0) }))
    .filter(({ gap }) => gap >= 3)
    .sort((left, right) => right.gap - left.gap);
  const surplus = props.zones
    .filter(hasOperationalObservation)
    .map((zone) => Math.max(0, -(zone.operationalGap ?? operationalGapFor(zone) ?? 0)))
    .filter((gap) => gap >= 4);
  const totalDeficit = deficits.reduce((sum, item) => sum + item.gap, 0);
  const totalSurplus = surplus.reduce((sum, gap) => sum + gap, 0);
  const deficitQuantiles = deficits.map(({ zone, gap }) => ({ zone, gap, quantiles: demandQuantiles(zone, props.horizon) }));
  const bandHigh = deficitQuantiles.reduce((sum, { zone, gap, quantiles }) => (
    sum + Math.max(gap, Math.round((quantiles.p90 ?? zone.demand) - zone.supply))
  ), 0);
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
          {deficitQuantiles.map(({ zone, gap, quantiles }) => {
            const hotspot = hotspotsByZone.get(zone.id);
            return <button key={zone.id} onClick={() => props.onZoneSelect(zone.id)} type="button">
              <b>{zone.label}<small>p10 {quantiles.p10 ?? '—'} · p50 {quantiles.p50 ?? '—'} · p90 {quantiles.p90 ?? '—'}</small>{hotspot && <small>Hotspot {hotspot.severity ?? 'High'}: gap {formatNumber(hotspot.contributingFeatures?.gap ?? gap)} xe ≥ ngưỡng {formatNumber(hotspot.threshold ?? 0)} xe · {(hotspot.reasonCodes ?? [hotspot.reason]).join(', ')}</small>}</b><i><span style={{ width: `${Math.round(gap / maxGap * 100)}%` }} /></i><strong>−{formatNumber(gap)} xe</strong>
            </button>;
          })}
        </div>
        <h3>GIẢ ĐỊNH &amp; ĐẦU VÀO</h3>
        <dl className="nf-assumptions">
          <dt>Snapshot</dt><dd>{props.sourceTime} · 30/30 zone · dữ liệu dự án</dd>
          <dt>Horizon</dt><dd>{props.horizon} phút → {props.forecastTime}</dd>
          <dt>Model</dt><dd>{props.modelVersion ?? "Không xác định"}</dd>
          <dt>Chế độ</dt><dd>{props.forecastMode ?? "Không xác định"}</dd>
          <dt>Nguồn</dt><dd>{props.dataSource ?? "AI zone observations"}</dd>
          <dt>ForecastRun</dt><dd>{props.forecastRun?.id ?? "Không xác định"}</dd>
          <dt>Trạng thái run</dt><dd>{props.forecastRun?.status ?? "Không xác định"} · {props.forecastRun?.zoneCount ?? 0}/30 zone</dd>
          <dt>Bất định</dt><dd>Dải p10–p90 do model trả về cho từng zone</dd>
        </dl>
      </div>
    </section>
  );
}
