/** Vietnamese-locale formatters for the values shown on the driver screens. */

/**
 * Metres → Vietnamese distance string.
 * Under 1 km rounds to the nearest 10 m ("450 m"); above uses a decimal comma ("3,2 km").
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Seconds → "9 phút". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '— phút';
  return `${Math.max(1, Math.round(seconds / 60))} phút`;
}

/**
 * Seconds of travel → arrival clock, e.g. 540s → "18:12".
 *
 * Anchored to the real clock. It used to count from a hardcoded 18:03 because the
 * status bar itself was scripted ("10:42" / "12:15"); now that the clock ticks for
 * real, a fixed anchor would put the arrival time hours away from what the driver
 * sees at the top of the screen.
 */
export function formatArrival(seconds: number, from: Date = new Date()): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—:—';
  const arrival = new Date(from.getTime() + Math.round(seconds / 60) * 60_000);
  return `${arrival.getHours()}:${String(arrival.getMinutes()).padStart(2, '0')}`;
}

/** Clock time of day, "H:mm". */
export function formatClock(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Đồng VNĐ với dấu chấm phân nhóm: 51000 → "51.000đ".
 *
 * NUMERIC của Postgres về client dạng chuỗi, nên hàm nhận cả string lẫn number.
 */
export function formatVnd(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return '0đ';
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

/** "18:30" từ một timestamptz ISO. Dùng cho hạn chót của campaign. */
export function formatTimeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—:—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—:—';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "20/04/2026" từ Date. */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
