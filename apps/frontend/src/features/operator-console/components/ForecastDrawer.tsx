import { X } from "lucide-react";

import { hasOperationalObservation, operationalGapFor, type ForecastRun, type Hotspot, type Zone } from "@/features/operator-data";
import { fleetBalanceSummary } from "../model/fleetBalanceSummary";
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
    : horizon === 15
      ? zone.demandRange15
    : horizon === 30
      ? zone.demandRange30
      : null;
  const p50 = horizon === 5
    ? zone.forecast5
    : horizon === 15
      ? zone.forecast15
    : horizon === 30
      ? zone.forecast30
      : null;
  return { p10: range?.[0] ?? null, p50: p50 ?? null, p90: range?.[1] ?? null };
}

const vehicleNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function formatVehicle(value: number | null) {
  return value === null ? "—" : vehicleNumber.format(value);
}

export function ForecastDrawer(props: ForecastDrawerProps) {
  const hotspotsByZone = new Map(props.hotspots.map((hotspot) => [hotspot.zoneId, hotspot]));
  const balance = fleetBalanceSummary(props.zones);
  const allRiskDeficits = props.zones
    .filter(hasOperationalObservation)
    .map((zone) => ({ zone, gap: Math.max(0, zone.operationalGap ?? operationalGapFor(zone) ?? 0) }))
    .filter(({ gap }) => gap > 0)
    .sort((left, right) => right.gap - left.gap);
  const deficits = allRiskDeficits.filter(({ gap }) => gap >= 3);
  const minorDeficits = allRiskDeficits.filter(({ gap }) => gap < 3);
  const surplusZones = props.zones
    .filter(hasOperationalObservation)
    .filter((zone) => (operationalGapFor(zone) ?? 0) < 0);
  const deficitQuantiles = deficits.map(({ zone, gap }) => ({ zone, gap, quantiles: demandQuantiles(zone, props.horizon) }));
  const displayedRiskDeficit = deficits.reduce((total, item) => total + item.gap, 0);
  const groupedRiskDeficit = Math.max(0, balance.riskAdjustedDeficit - displayedRiskDeficit);
  const maxGap = Math.max(1, ...deficits.map((item) => item.gap));

  return (
    <section aria-label="Chi tiết kết quả dự báo" className="nf-plan-drawer">
      <header>
        <div><small>BẢNG CHI TIẾT · KẾT QUẢ TÍNH TOÁN</small><strong>Kết quả dự báo</strong>
          <p>Ước lượng tại {props.forecastTime}. Chưa có phương án điều chuyển nào được tạo.</p></div>
        <button aria-label="Đóng bảng chi tiết" onClick={props.onClose} type="button"><X size={17} /></button>
      </header>
      <div className="nf-forecast-summary">
        <div className="is-median"><small>THIẾU HỤT TRUNG VỊ P50</small><strong>{formatNumber(balance.medianDeficit)} xe</strong>
          <span>Kịch bản vận hành có khả năng nhất</span></div>
        <div className="is-risk"><small>THIẾU HỤT THẬN TRỌNG P90</small><strong>{formatNumber(balance.riskAdjustedDeficit)} xe</strong>
          <span>{formatNumber(balance.medianDeficit)} xe p50 + {formatNumber(balance.riskBuffer)} xe đệm rủi ro</span></div>
        <div className="is-surplus"><small>NGUỒN DƯ TRUNG VỊ P50</small><strong>{formatNumber(balance.forecastSurplus)} xe</strong>
          <span>{surplusZones.length} zone · trước các ràng buộc điều chuyển</span></div>
      </div>
      <div className="nf-plan-scroll nf-scroll">
        <h3>ĐỐI CHIẾU TỔNG THIẾU HỤT P90</h3>
        <div aria-label="Đối chiếu tổng thiếu hụt p90" className="nf-risk-reconciliation">
          <span><small>{deficits.length} vùng đang hiển thị<br />từ 3 xe/vùng</small><b>{formatNumber(displayedRiskDeficit)} xe</b></span>
          <i aria-hidden="true">+</i>
          <span><small>{minorDeficits.length} vùng được gom<br />dưới 3 xe/vùng</small><b>{formatNumber(groupedRiskDeficit)} xe</b></span>
          <i aria-hidden="true">=</i>
          <span className="is-total"><small>Tổng thiếu hụt<br />thận trọng p90</small><b>{formatNumber(balance.riskAdjustedDeficit)} xe</b></span>
        </div>
        <p className="nf-risk-note">Danh sách dưới đây dùng kịch bản p90, không phải các thành phần của tổng thiếu hụt p50.</p>
        <h3>{deficits.length} VÙNG THIẾU TỪ 3 XE · KỊCH BẢN P90 TẠI {props.forecastTime}</h3>
        <div className="nf-hotspot-list">
          {deficitQuantiles.map(({ zone, gap, quantiles }) => {
            const hotspot = hotspotsByZone.get(zone.id);
            return <button key={zone.id} onClick={() => props.onZoneSelect(zone.id)} type="button">
              <b>{zone.label}<small>Cầu dự báo: p10 {formatVehicle(quantiles.p10)} · p50 {formatVehicle(quantiles.p50)} · p90 {formatVehicle(quantiles.p90)}</small>{hotspot && <small>Hotspot chính sách {hotspot.severity ?? 'High'}: gap {formatNumber(hotspot.contributingFeatures?.gap ?? gap)} xe ≥ ngưỡng {formatNumber(hotspot.threshold ?? 0)} xe · {(hotspot.reasonCodes ?? [hotspot.reason]).join(', ')}</small>}</b><i><span style={{ width: `${Math.round(gap / maxGap * 100)}%` }} /></i><strong>−{formatNumber(gap)} xe</strong>
            </button>;
          })}
        </div>
        {minorDeficits.length > 0 && <div className="nf-minor-risk-summary">
          <span><b>{minorDeficits.length} vùng còn lại</b><small>Mỗi vùng thiếu dưới 3 xe ở p90 nên được gom thay vì ẩn khỏi tổng.</small></span>
          <strong>−{formatNumber(groupedRiskDeficit)} xe</strong>
        </div>}
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
