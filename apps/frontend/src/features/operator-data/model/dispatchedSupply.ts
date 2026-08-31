// Tác động của một lượt điều phối lên cung của từng zone — lớp phủ chỉ-đọc.
//
// Bảng khu vực đọc `demand − supply` từ snapshot, mà snapshot là bản replay **đóng băng**
// (CLAUDE.md §13.1). Điều xe không ghi vào đó và **không được phép ghi**: viết đè lên
// `ai_zone_observations` là làm hỏng vĩnh viễn mọi so sánh baseline đã công bố.
//
// Hệ quả trước khi có file này: duyệt xong, điều xe xong, tài xế báo về xong — vùng đỏ vẫn
// đỏ nguyên. Số duy nhất phản ánh việc điều xe là `reconciliations.residual_gap`, nằm trong
// một drawer và chỉ hiện khi batch xong. Chỗ người vận hành đang nhìn thì không có gì đổi,
// nên cả chuỗi dự báo → phương án → điều phối trông như không dẫn tới đâu.
//
// Nên tác động được cộng **ở tầng hiển thị**: dữ liệu gốc giữ nguyên, cái đổi là con số đưa
// ra màn hình.

import type { DispatchBatch, Zone } from '@/features/operator-data/model/types'

/** `AI-Z07` từ `7` — hai adapter đều sinh id theo đúng khuôn này. */
function zoneKey(zoneId: number): string {
  return `AI-Z${String(zoneId).padStart(2, '0')}`
}

/** Thay đổi cung theo zone, cộng dồn từ mọi chặng của một lượt điều phối.
 *
 * Hai vế **không đối xứng**, và đó là chỗ đáng nói:
 *
 * · Zone nguồn mất xe ngay khi tài xế nhận lệnh (`acknowledgedUnits`) — xe rời đi thật, nên
 *   một zone dư có thể xanh nhạt đi. Giấu vế này sẽ tạo ra xe từ hư không và tổng cung toàn
 *   hệ thống phình lên sau mỗi lượt điều phối, đúng thứ INV-2 sinh ra để cấm.
 * · Zone đích chỉ được cộng khi xe **đã sẵn sàng** ở đó (`availableUnits`), tức đã có
 *   telemetry `AVAILABLE` chất lượng `VALID`. Cộng sớm hơn là hứa một chiếc xe chưa tới.
 *
 * Khoảng giữa hai mốc, xe không được tính là cung rỗi ở bất kỳ đâu — đúng nghĩa
 * `enroute_supply` của mô hình. Vì thế tổng cung **hụt tạm thời** trong lúc xe đang chạy,
 * và đó là mô tả đúng chứ không phải lỗi làm tròn.
 *
 * `failedUnits` không bị trừ khỏi zone nguồn: chặng hỏng thì xe không đi đâu cả.
 */
export function dispatchSupplyDelta(batch: DispatchBatch | undefined): ReadonlyMap<string, number> {
  const delta = new Map<string, number>()
  if (!batch) return delta

  const add = (zoneId: number, units: number) => {
    if (units === 0) return
    const key = zoneKey(zoneId)
    delta.set(key, (delta.get(key) ?? 0) + units)
  }

  for (const move of batch.moves) {
    add(move.sourceZoneId, -Math.max(0, move.acknowledgedUnits - move.failedUnits))
    add(move.targetZoneId, move.availableUnits)
  }
  return delta
}

/** Snapshot cộng tác động điều phối. Zone chưa có quan sát thì giữ nguyên, không đoán. */
export function zonesAfterDispatch(
  zones: readonly Zone[],
  batch: DispatchBatch | undefined,
): readonly Zone[] {
  const delta = dispatchSupplyDelta(batch)
  if (delta.size === 0) return zones

  return zones.map((zone) => {
    const change = delta.get(zone.id)
    if (!change || typeof zone.supply !== 'number') return zone
    // Chặn ở 0: số xe âm là vô nghĩa trên màn hình. Chạm đáy nghĩa là lượt điều phối đang
    // dựa trên một snapshot cũ hơn hiện tại — hiện 0 vẫn thật hơn là hiện số âm.
    return { ...zone, supply: Math.max(0, zone.supply + change) }
  })
}
