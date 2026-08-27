import { hasOperationalObservation, operationalGapFor, type Zone } from "@/features/operator-data";

export type ZoneBalanceRow = { gap: number; id: string; label: string }

export type ZoneBalanceLimits = { deficits: number; surpluses: number }

export const defaultZoneBalanceLimits: ZoneBalanceLimits = { deficits: 6, surpluses: 3 };

/**
 * Hai đầu của cán cân cung–cầu: các zone thiếu nhiều nhất và các zone dư nhiều nhất.
 *
 * Cố ý lấy từ **cả hai đầu** thay vì cắt top-N sau khi sắp xếp: điều chuyển cần biết chở xe
 * *từ đâu* chứ không chỉ *đến đâu*, mà số zone thiếu thường nhiều hơn hạn mức hiển thị nên
 * cách cắt một đầu sẽ xoá sạch nhóm zone dư khỏi biểu đồ.
 *
 * Zone chưa có quan sát hợp lệ bị loại thay vì tính là 0 — đó là "chưa đo được", không phải
 * "đang cân bằng".
 */
export function zoneBalanceRows(
  zones: readonly Zone[],
  limits: ZoneBalanceLimits = defaultZoneBalanceLimits,
): readonly ZoneBalanceRow[] {
  const rows = zones
    .filter(hasOperationalObservation)
    .map((zone) => ({ gap: Math.round(zone.operationalGap ?? operationalGapFor(zone) ?? 0), id: zone.id, label: zone.label }))
    .filter((row) => row.gap !== 0);

  const deficits = rows.filter((row) => row.gap > 0).sort((left, right) => right.gap - left.gap).slice(0, limits.deficits);
  const surpluses = rows.filter((row) => row.gap < 0).sort((left, right) => left.gap - right.gap).slice(0, limits.surpluses);

  // Thiếu nhiều nhất ở trên, dư nhiều nhất ở dưới: đọc từ trên xuống là đi từ "cần bù" sang "có thể rút".
  return [...deficits, ...surpluses.reverse()];
}
