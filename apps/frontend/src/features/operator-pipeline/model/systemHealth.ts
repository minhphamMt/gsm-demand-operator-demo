// Suy ra bộ chỉ số giám sát của tab Overview (agent/07-Design §3) từ snapshot vận hành.
//
// Không cài lại công thức metric (CLAUDE.md §5.2): tỷ lệ đáp ứng và thời gian chờ proxy chỉ
// lấy nguyên từ `snapshot.kpis` — do backend tính theo `apps/ai/src/simulation/metrics.py`.
// Vì thế hai chỉ số đó **chỉ có ở mốc hiện tại**; ở mốc dự báo chúng là `null`, không đoán.
// Phần tổng hợp theo zone dùng chung helper `operationalGapFor`, không tự viết công thức gap.

import { hasOperationalObservation, operationalGapFor, type Snapshot, type Zone } from '@/features/operator-data'
import { projectZones, type PanelHorizon } from '@/features/operator-pipeline/model/horizonProjection'

export type ZoneBreakdownRow = {
  zoneId: string
  label: string
  supply: number
  demand: number
  gap: number
  demandSharePct: number
}

export type SystemHealth = {
  horizon: PanelHorizon
  totalSupply: number
  activeDemand: number
  residualGap: number
  demandPressurePct: number
  fulfillmentRatePct: number | null
  avgWaitProxy: number | null
  observedZoneCount: number
  registeredZoneCount: number
  hotspotCount: number
  breakdown: readonly ZoneBreakdownRow[]
}

// Ngưỡng cảnh báo mặc định của thanh trượt §3.7 — chỉ là ngưỡng **hiển thị** phía client.
// Ngưỡng chính sách thật nằm ở config/policy.yaml và frontend không được ghi vào đó
// (CLAUDE.md §3 #2).
export const defaultResidualGapAlert = 40

export function buildSystemHealth(snapshot: Snapshot, horizon: PanelHorizon): SystemHealth {
  const observed = projectZones(snapshot.zones, horizon).filter(hasOperationalObservation)
  const isNow = horizon === 0
  const totalSupply = isNow ? snapshot.kpis.fleetAvailable : sum(observed, (zone) => zone.supply ?? 0)
  const activeDemand = isNow ? snapshot.kpis.requests : sum(observed, (zone) => zone.demand ?? 0)
  const residualGap = isNow ? snapshot.kpis.residualGap : sum(observed, gapOf)

  return {
    horizon,
    totalSupply,
    activeDemand,
    residualGap,
    demandPressurePct: demandPressure(activeDemand, totalSupply),
    fulfillmentRatePct: isNow ? snapshot.kpis.fulfillmentRate : null,
    avgWaitProxy: isNow ? snapshot.kpis.avgWaitProxy : null,
    observedZoneCount: observed.length,
    registeredZoneCount: snapshot.ai?.registeredZones ?? snapshot.zones.length,
    hotspotCount: snapshot.hotspots.length,
    breakdown: observed
      .map((zone) => toBreakdownRow(zone, activeDemand))
      .sort((left, right) => right.gap - left.gap || right.demand - left.demand),
  }
}

const gapOf = (zone: Zone) => Math.max(0, operationalGapFor(zone) ?? 0)

function sum(zones: readonly Zone[], value: (zone: Zone) => number): number {
  return zones.reduce((total, zone) => total + Math.max(0, value(zone)), 0)
}

function toBreakdownRow(zone: Zone, activeDemand: number): ZoneBreakdownRow {
  const demand = zone.demand ?? 0
  return {
    zoneId: zone.id,
    label: zone.label,
    supply: zone.supply ?? 0,
    demand,
    gap: gapOf(zone),
    demandSharePct: activeDemand > 0 ? Math.round((demand / activeDemand) * 1_000) / 10 : 0,
  }
}

// Cầu so với cung, kẹp 0–100 để vẽ thanh cân bằng. 100% nghĩa là cầu đã bằng hoặc vượt cung.
function demandPressure(activeDemand: number, totalSupply: number): number {
  if (totalSupply <= 0) return activeDemand > 0 ? 100 : 0
  return Math.min(100, Math.round((activeDemand / totalSupply) * 1_000) / 10)
}
