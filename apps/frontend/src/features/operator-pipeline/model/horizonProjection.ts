// Chế độ dự báo của panel (agent/07-Design §3 + yêu cầu "bật dự báo 15/30 phút").
//
// Model 1 chỉ được train ở horizon 5/10/15 phút (apps/ai/src/forecasting/features.py:42) và
// backend cũng chỉ khai báo [5,10,15]. Mốc +30 vì vậy **không phải output model**: nó là
// ngoại suy tuyến tính từ chính độ dốc quan sát → +15 của snapshot hiện tại.
// Mọi chỗ hiển thị mốc này phải gắn nhãn `extrapolated` và không được dùng để tạo phương án.
// Ghi nhận giả định: [ASSUMPTION-44] — chờ đăng ký vào ASSUMPTION register của DATA_CONTRACT.

import { hasOperationalObservation, operationalGapFor, type Zone } from '@/features/operator-data'

export type PanelHorizon = 0 | 15 | 30

export const panelHorizons: readonly PanelHorizon[] = [0, 15, 30]

export const extrapolatedHorizon: PanelHorizon = 30

export const horizonLabel: Record<PanelHorizon, string> = {
  0: 'Hiện tại',
  15: '+15 phút',
  30: '+30 phút',
}

export function isExtrapolated(horizon: PanelHorizon): boolean {
  return horizon === extrapolatedHorizon
}

/** Chiếu 30 zone sang mốc dự báo. Mốc 0 và 15 là số model; mốc 30 là ngoại suy. */
export function projectZones(zones: readonly Zone[], horizon: PanelHorizon): readonly Zone[] {
  if (horizon === 0) return zones
  return zones.map((zone) => projectZone(zone, horizon))
}

function projectZone(zone: Zone, horizon: PanelHorizon): Zone {
  if (!hasOperationalObservation(zone)) return zone
  const demand = extend(zone.demand ?? 0, zone.forecast15, horizon)
  const supply = extend(zone.supply ?? 0, zone.forecastSupply15 ?? zone.supply ?? 0, horizon)
  const gap = Math.max(0, operationalGapFor({ demand, rainMmH: zone.rainMmH, supply }) ?? 0)
  return { ...zone, demand, supply, gap, operationalGap: gap }
}

// +15 lấy thẳng số model. +30 kéo dài đúng một lần độ dốc đó — không có mốc model thứ hai để
// nội suy, và "xu hướng 15 phút tới giữ nguyên thêm 15 phút nữa" là giả định tường minh duy
// nhất mà dữ liệu hiện có cho phép. Backend đang trả forecast30 = forecast15 (carry-forward
// phẳng) nên không dùng được trường đó: nó sẽ vẽ ra một mốc +30 y hệt +15.
function extend(now: number, forecast15: number, horizon: PanelHorizon): number {
  if (horizon === 15) return Math.max(0, Math.round(forecast15))
  return Math.max(0, Math.round(forecast15 + (forecast15 - now)))
}
