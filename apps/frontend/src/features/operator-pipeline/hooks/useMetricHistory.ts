// Tích lũy chuỗi chỉ số theo từng replay step mà phiên xem đi qua.
// Backend không có endpoint series (xem model/metricHistory.ts), nên đây là nơi duy nhất
// biết được lịch sử — và chỉ trong phạm vi phiên xem hiện tại.

import { useEffect, useState } from 'react'

import type { Snapshot } from '@/features/operator-data'
import { appendMetricPoint, type MetricPoint } from '@/features/operator-pipeline/model/metricHistory'
import { buildSystemHealth } from '@/features/operator-pipeline/model/systemHealth'

export function useMetricHistory(snapshot: Snapshot | undefined): readonly MetricPoint[] {
  const [history, setHistory] = useState<readonly MetricPoint[]>([])
  const sourceAt = snapshot?.sourceAt ?? snapshot?.generatedAt

  useEffect(() => {
    if (!snapshot || !sourceAt) return
    // Luôn ghi ở mốc hiện tại: chuỗi lịch sử phải là số đã quan sát, không phải số dự báo.
    const health = buildSystemHealth(snapshot, 0)
    setHistory((entries) => appendMetricPoint(entries, {
      sourceAt,
      residualGap: health.residualGap,
      fulfillmentRatePct: health.fulfillmentRatePct ?? 0,
      avgWaitProxy: health.avgWaitProxy ?? 0,
      demandPressurePct: health.demandPressurePct,
    }))
  }, [snapshot, sourceAt])

  return history
}
