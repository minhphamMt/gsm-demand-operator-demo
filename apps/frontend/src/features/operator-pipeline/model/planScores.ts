// Chấm điểm phương án theo `agent/02-technical-spec.md` §2.6: mỗi chỉ số của mỗi plan nhận
// một nhãn `GOOD | MEDIUM | BAD`, và chi phí thêm một nhãn `LOW | MEDIUM | HIGH`.
//
// Điểm là **thứ hạng trong chính bộ phương án đang xét**, không phải ngưỡng tuyệt đối: spec
// mô tả nó là thanh so sánh giữa PLAN A/B/C. Vì vậy một phương án đơn lẻ không có điểm —
// không có gì để so, và gán "GOOD" cho nó là bịa ra một đánh giá.
//
// Không đụng tới con số: điểm chỉ xếp hạng các giá trị mà backend đã tính.

import type { PipelinePlan } from '@/features/operator-pipeline/model/pipelineRun'

export type PlanScore = 'GOOD' | 'MEDIUM' | 'BAD'

export type CostBand = 'LOW' | 'MEDIUM' | 'HIGH'

export type PlanMetricKey = 'total_units' | 'total_cost' | 'total_eta_step_units' | 'residual_zone_count'

// Chỉ số nào thấp hơn là tốt hơn. `total_units` không nằm ở đây: điều nhiều xe hơn không
// mặc nhiên xấu, nó là mức độ can thiệp — spec xếp nó vào nhóm "nhiều hơn thì phủ tốt hơn".
const lowerIsBetter: Readonly<Record<PlanMetricKey, boolean>> = {
  total_units: false,
  total_cost: true,
  total_eta_step_units: true,
  residual_zone_count: true,
}

export function scoreMetric(
  plans: readonly PipelinePlan[],
  key: PlanMetricKey,
  value: number,
): PlanScore | null {
  const values = plans.map((plan) => plan[key])
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (plans.length < 2 || min === max) return null

  const best = lowerIsBetter[key] ? min : max
  const worst = lowerIsBetter[key] ? max : min
  if (value === best) return 'GOOD'
  if (value === worst) return 'BAD'
  return 'MEDIUM'
}

/** Nhãn chi phí `LOW | MEDIUM | HIGH` của §2.6, xếp theo vị trí trong bộ phương án. */
export function costBand(plans: readonly PipelinePlan[], plan: PipelinePlan): CostBand | null {
  const score = scoreMetric(plans, 'total_cost', plan.total_cost)
  if (score === null) return null
  return score === 'GOOD' ? 'LOW' : score === 'BAD' ? 'HIGH' : 'MEDIUM'
}

export const costBandLabel: Record<CostBand, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
}

export const planScoreLabel: Record<PlanScore, string> = {
  GOOD: 'Tốt nhất nhóm',
  MEDIUM: 'Trung bình',
  BAD: 'Kém nhất nhóm',
}
