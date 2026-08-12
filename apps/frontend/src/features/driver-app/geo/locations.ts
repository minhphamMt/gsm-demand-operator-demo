/**
 * Real Hanoi coordinates backing the demo.
 *
 * Scenario: the driver sits on Đ. Láng (south-east) and the surge zone is Cầu Giấy
 * — matching the scripted copy already in the UI ("Cầu Giấy đang thiếu khoảng 12 xe",
 * "Cách bạn 3,2 km · khoảng 9 phút").
 *
 * Geodesy at φ = 21°N: 1° lat = 110.717 km, 1° lng = 103.968 km.
 * Mapbox uses 512px tiles, so metres/pixel = 73_057.6 / 2^zoom at this latitude.
 * (NOT the 156543/2^z formula, which is for 256px tiles — using it is a full zoom level off.)
 */

/** [longitude, latitude] — Mapbox order. */
export type LngLat = [number, number];

/**
 * Đường Cầu Giấy at the Đường Láng end, south-east of the surge zone.
 *
 * Chosen empirically against the live Directions API rather than computed: road
 * topology (one-ways, the Tô Lịch crossings) dominates over straight-line distance
 * here — neighbouring points 300 m apart differ by up to 800 m of driving distance,
 * and several snap into alleys or force an opening U-turn.
 *
 * Measured: 1.92 km great-circle → 3.01 km driving, ~12 min in traffic.
 *   Δlat 0.0062° × 110.717 = 0.686 km
 *   Δlng 0.0172° × 103.968 = 1.788 km
 *   √(0.686² + 1.788²)     = 1.915 km   → detour factor ≈ 1.57
 *
 * This point snaps onto Đường Cầu Giấy itself, so the first live instruction reads
 * "Rẽ phải trên Đường Cầu Giấy" — a real arterial, and it matches the design's
 * "Sau đó · Đ. Cầu Giấy" strip.
 *
 * Note the design's scripted "3,2 km · khoảng 9 phút" is not jointly achievable with
 * real data: Hanoi traffic averages ~15 km/h on this corridor, so 3 km is ~12 min.
 * The screens bind to the live values instead of the scripted pair.
 */
export const DRIVER_START: LngLat = [105.8456667, 21.0050833];

/** Flat, north-up — matches the design's flat aesthetic. */
export const DEFAULT_PITCH = 0;
export const DEFAULT_BEARING = 0;

/**
 * Camera presets, expressed as *intent* rather than live state — the user can drag
 * the map freely, so the map itself stays the source of truth for camera position.
 *
 * `zoneFocus.zoom` of 14.4 preserves the old fake zoom exactly: `scale(2.05)` is
 * log₂(2.05) = +1.036 zoom levels, and overview fits at z ≈ 13.33 → 13.33 + 1.04 ≈ 14.4.
 */
export const CAMERA = {
  /** Home screens: driver centred, no pins — reproduces the original centred puck. */
  driverFocus: {
    center: DRIVER_START,
    zoom: 15,
  },
  /**
   * Demand map with no sheet: fit driver + all four pins.
   * SW corner = westernmost pin lng, driver lat; NE = driver lng, northernmost pin lat.
   */
  overview: {
    bounds: [
      [105.77855, 21.03],
      [105.7998, 21.03927],
    ] as [LngLat, LngLat],
    padding: { top: 120, bottom: 210, left: 24, right: 24 },
  },
  /**
   * Demand sheet open. `bottom: 470` clears the 452px sheet, putting the zone at
   * y ≈ 232px — well above the sheet's top edge at y = 392.
   * Visible band = 844 − 470 − 90 = 284px × 3.38 m/px = 960 m N–S vs 756 m pin spread. ✓
   *
   * (Số liệu dưới đây tính từ thời kỳ 4 pin `REWARD_PINS` ghi cứng, bị gỡ ở story 1.5
   * và thay bằng vùng geofence thật vẽ trong `CampaignZoneLayer`. Camera offset vẫn
   * giữ nguyên vì hình học vùng thật hiện tại nằm gọn trong cùng khung hình; nếu sau
   * này khung hình lệch thì đây là lý do lịch sử, không phải căn cứ hiện tại.)
   */
  zoneFocus: {
    // Shifted ~125 m east of REWARD_ZONE_CENTER, not centred on it — xem ghi chú trên.
    center: [105.7838, 21.0362] as LngLat,
    zoom: 14.4,
    padding: { top: 90, bottom: 470, left: 24, right: 24 },
  },
} as const;

/** Framing for the turn-by-turn route: clears the turn card above and the ETA sheet below. */
export const ROUTE_FIT_PADDING = { top: 210, bottom: 240, left: 40, right: 40 } as const;

/** Camera transition duration, matching the old CSS `.55s` transition. */
export const CAMERA_DURATION = 550;
