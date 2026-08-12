/**
 * Nguồn duy nhất cho mọi query key TanStack Query dùng trong `data/`.
 *
 * Trước file này, mỗi hook tự khai key của mình bằng literal (`['driver-offers', driverId]`),
 * và `DriverRealtime.tsx` phải chép lại đúng literal đó để biết invalidate cache nào khi có
 * sự kiện Realtime. Hai bản khai cho cùng một cache entry hôm nay khớp nhau, nhưng không có
 * gì giữ chúng khớp khi nhiều người sửa song song — lệch một ký tự là UI ngừng tự cập nhật,
 * một lỗi im lặng không có stack trace.
 *
 * Phương án khác đã cân và loại (ADR-0011):
 * - Giữ nguyên, mỗi hook tự khai: chính là nguồn của divergence trên.
 * - Export hàm `key()` từ hook sở hữu resource, nơi khác import lại: đỡ hơn nhưng tạo mạng
 *   phụ thuộc chéo giữa các hook trong `data/` (mutation hook phải import từ 3-4 hook đọc).
 * - Một module tập trung như dưới đây: chọn — không phụ thuộc chéo, một chỗ duy nhất để sửa.
 *
 * `participations` và `campaign` chưa có hook nào tiêu thụ ở thời điểm viết file này — cố ý:
 * gom hết key ngay từ đầu để story 1.4/Epic 3 không phải mở lại file này.
 *
 * `campaigns` (số nhiều, story 1.4) khoá theo `driverId` — danh sách chiến dịch của
 * tài xế đang đăng nhập, đọc qua `campaigns_driver_v`. Khác `campaign` (số ít) ở trên,
 * key đó khoá theo `campaignId` đã biết trước; hai key không thay thế nhau được.
 */
export const qk = {
  driverState: (driverId: string) => ['driver-state', driverId] as const,
  offers: (driverId: string) => ['driver-offers', driverId] as const,
  earnings: (driverId: string) => ['earnings', driverId] as const,
  participations: (driverId: string) => ['participations', driverId] as const,
  campaign: (campaignId: string) => ['campaign', campaignId] as const,
  campaigns: (driverId: string) => ['campaigns', driverId] as const,
} as const;
