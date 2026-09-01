import type { PolicyMetrics, PolicyRule } from '@/features/operator-data/model/types'

// Dịch payload `/operator/ai/policy` sang hình dạng bảng chỉ số dùng.
//
// Tách khỏi adapter để test được mà không cần HTTP, và vì đây là chỗ duy nhất biết cách
// ghép `rules` với `meta`: hai khối đi riêng trong payload nên nếu mỗi component tự ghép,
// một component sẽ hiện giá trị mà thiếu đơn vị hoặc thiếu nhãn "chưa chốt".
//
// KHÔNG có bảng ngưỡng dự phòng ở đây. Đọc policy hỏng thì bảng phải trống và nói ra lý do
// — một bộ số cứng trong frontend chính là người đọc thứ hai mà CLAUDE.md §3 #2 cấm.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isRuleValue = (value: unknown): value is number | readonly number[] | string =>
  typeof value === 'number'
  || typeof value === 'string'
  || (Array.isArray(value) && value.every((item) => typeof item === 'number'))

/**
 * `tunable` lấy từ server, không suy lại ở client.
 *
 * Suy lại nghĩa là chép luật của `operator_tunable_keys` sang TypeScript; hai bản sẽ trôi
 * khỏi nhau và điều phối viên kéo xong một thanh mới nhận 422. Server nói được chỉnh thì
 * mới cho chỉnh.
 */
export function readPolicyMetrics(payload: unknown): PolicyMetrics | undefined {
  if (!isRecord(payload) || !isRecord(payload.rules) || !isRecord(payload.meta)) return undefined
  const tunable = new Set(Array.isArray(payload.tunable) ? payload.tunable.filter((key): key is string => typeof key === 'string') : [])

  const rules: PolicyRule[] = []
  for (const [key, value] of Object.entries(payload.rules)) {
    if (!isRuleValue(value)) continue
    const meta = isRecord(payload.meta[key]) ? payload.meta[key] : {}
    rules.push({
      key,
      value,
      unit: typeof meta.unit === 'string' ? meta.unit : undefined,
      usedBy: Array.isArray(meta.used_by) ? meta.used_by.filter((item): item is string => typeof item === 'string') : [],
      verified: meta.verified === true,
      owner: typeof meta.owner === 'string' ? meta.owner : undefined,
      assumption: typeof meta.assumption === 'string' ? meta.assumption : undefined,
      tunable: tunable.has(key),
    })
  }
  if (!rules.length) return undefined

  return {
    version: typeof payload.version === 'string' ? payload.version : '',
    frozenAt: typeof payload.frozen_at === 'string' ? payload.frozen_at : '',
    rules,
  }
}
