// Chuỗi thời gian cho biểu đồ xu hướng ở tab Overview (agent/07-Design §3.5).
//
// Backend không có endpoint series: mỗi lần gọi chỉ trả một snapshot tại một mốc.
// Nên chuỗi được tích lũy phía client theo từng replay step mà phiên xem đi qua —
// đều là số thật của từng snapshot, không nội suy, không sinh thêm điểm.
// Đổi lại, chuỗi chỉ dài bằng phiên xem hiện tại và mất khi tải lại trang.

export type MetricKey = 'fulfillmentRatePct' | 'residualGap' | 'avgWaitProxy' | 'demandPressurePct'

export type MetricPoint = {
  sourceAt: string
  fulfillmentRatePct: number
  residualGap: number
  avgWaitProxy: number
  demandPressurePct: number
}

export const maxMetricPoints = 24

export type MetricSeries = { key: MetricKey; label: string; unit: string }

const seriesByKey: Record<MetricKey, MetricSeries> = {
  residualGap: { key: 'residualGap', label: 'Thiếu hụt còn lại', unit: 'xe' },
  fulfillmentRatePct: { key: 'fulfillmentRatePct', label: 'Tỷ lệ đáp ứng', unit: '%' },
  avgWaitProxy: { key: 'avgWaitProxy', label: 'Chờ trung bình (proxy)', unit: 'phút' },
  demandPressurePct: { key: 'demandPressurePct', label: 'Áp lực cầu / cung', unit: '%' },
}

export const metricSeries: readonly MetricSeries[] = Object.values(seriesByKey)

/** Thêm một mốc, ghi đè nếu cùng `sourceAt`, và cắt bớt phần cũ nhất. */
export function appendMetricPoint(
  history: readonly MetricPoint[],
  point: MetricPoint,
): readonly MetricPoint[] {
  const previous = history.filter((entry) => entry.sourceAt !== point.sourceAt)
  return [...previous, point].slice(-maxMetricPoints)
}

export function metricSeriesFor(key: MetricKey): MetricSeries {
  return seriesByKey[key]
}
