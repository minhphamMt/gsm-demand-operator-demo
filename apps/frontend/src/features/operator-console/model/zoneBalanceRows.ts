import { hasOperationalObservation, operationalGapFor, type Zone } from "@/features/operator-data";

export type ZoneBalanceRow = { gap: number; id: string; label: string }

/**
 * Các zone lệch nhiều nhất của **đúng snapshot đang xem**, thiếu xếp trước dư.
 *
 * Zone chưa có quan sát hợp lệ bị loại thay vì tính là 0: vẽ chúng ở mốc cân bằng là nói dối
 * rằng đã đo được, trong khi thực tế là thiếu dữ liệu.
 */
export function zoneBalanceRows(zones: readonly Zone[], limit = 12): readonly ZoneBalanceRow[] {
  return zones
    .filter(hasOperationalObservation)
    .map((zone) => ({ gap: Math.round(zone.operationalGap ?? operationalGapFor(zone) ?? 0), id: zone.id, label: zone.label }))
    .filter((row) => row.gap !== 0)
    .sort((left, right) => right.gap - left.gap)
    .slice(0, limit);
}
