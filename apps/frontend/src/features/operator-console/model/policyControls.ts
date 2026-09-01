import type { PolicyMetrics, PolicyOverrides, PolicyRule } from '@/features/operator-data'
import { formatCurrency, formatMultiplier, formatNumber, formatPercentRatio } from '@/shared/lib/format'

// Luật hiển thị và luật kéo của bảng chỉ số chính sách.
//
// Tách khỏi component vì đây là phần có thể sai một cách im lặng: một khoảng kéo cho phép
// gửi giá trị mà server từ chối, hoặc một `pendingOverrides` coi giá trị chưa đổi là đã đổi,
// đều dẫn tới lượt chạy sai mà giao diện trông vẫn bình thường.
//
// KHÔNG có bảng ngưỡng cứng ở đây. Mọi khoảng kéo suy ra từ chính giá trị trong
// `policy.yaml` — viết sẵn min/max trong frontend là dựng người đọc ngưỡng thứ hai
// (CLAUDE.md §3 #2), và nó sẽ trôi khỏi file ngay lần đầu ai đó sửa file.

export type PolicySliderRange = { min: number; max: number; step: number }
export type PolicyGroupId = 'relocation' | 'activation'
export type PolicyGroup = { id: PolicyGroupId; label: string; rules: readonly PolicyRule[] }

const groupLabel: Record<PolicyGroupId, string> = {
  relocation: 'Điều chuyển xe',
  activation: 'Kích hoạt tài xế',
}

const isRatio = (rule: PolicyRule) => (rule.unit ?? '').startsWith('tỷ lệ')
const isMoney = (rule: PolicyRule) => (rule.unit ?? '').includes('VNĐ')

/** Ngưỡng chi phối việc điều xe của hãng, tách khỏi ngưỡng cam kết tiền với người ngoài.
 *
 * Không phải để cho đẹp: C-09 chốt hai ngân sách ĐỘC LẬP, không bù trừ. Xếp
 * `budget_cap` cạnh `incentive_budget_cap` trong một danh sách phẳng mời người đọc cộng
 * hai số đó lại thành "tổng ngân sách" — thứ không tồn tại.
 */
export function policyGroups(metrics: PolicyMetrics): readonly PolicyGroup[] {
  const belongsToActivation = (rule: PolicyRule) =>
    rule.usedBy.some((owner) => owner.startsWith('activation'))
    && !rule.usedBy.some((owner) => owner.startsWith('optimizer') || owner.startsWith('hotspot'))

  return (['relocation', 'activation'] as const)
    .map((id) => ({
      id,
      label: groupLabel[id],
      rules: metrics.rules.filter((rule) => (id === 'activation') === belongsToActivation(rule)),
    }))
    .filter((group) => group.rules.length > 0)
}

/**
 * Khoảng kéo quanh giá trị đang có trong `policy.yaml`.
 *
 * Trần 2× giá trị gốc thay vì một số tuyệt đối: ngưỡng ở đây chênh nhau tới bốn bậc độ lớn
 * (3 xe và 1.000.000 đồng), nên mọi trần dùng chung sẽ vừa vô dụng cho cái này vừa nguy
 * hiểm cho cái kia. Sàn đúng một bước để không kéo được về 0 — `apply_overrides` từ chối
 * số không dương, và một thanh kéo tới chỗ chắc chắn lỗi là một cái bẫy.
 *
 * Bước giữ nguyên tính nguyên của giá trị gốc: tiền là `int` (CLAUDE.md §5.2) nên một
 * bước lẻ sẽ sinh ra giá trị mà server trả 422.
 */
export function sliderRange(rule: PolicyRule): PolicySliderRange {
  const base = typeof rule.value === 'number' ? rule.value : 0
  if (isRatio(rule)) return { min: 0.05, max: 1, step: 0.05 }
  if (!Number.isInteger(base)) return { min: 0.1, max: round(base * 2, 1), step: 0.1 }
  const step = Math.max(1, Math.round(base / 20))
  return { min: step, max: Math.max(step * 2, base * 2), step }
}

/** Làm tròn theo bước để thanh kéo không sinh ra 0.30000000000000004. */
export function snapToStep(value: number, range: PolicySliderRange): number {
  const decimals = (String(range.step).split('.')[1] ?? '').length
  return round(Math.round(value / range.step) * range.step, decimals)
}

export function formatRuleValue(rule: PolicyRule, value: number | readonly number[] | string = rule.value): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Chưa đặt'
  if (typeof value === 'string') return value
  if (typeof value !== 'number') return '—'
  if (isRatio(rule)) return formatPercentRatio(value, 1)
  if (isMoney(rule)) return formatCurrency(value)
  if (rule.unit === 'hệ số') return formatMultiplier(value)
  return `${formatNumber(value)}${rule.unit ? ` ${rule.unit}` : ''}`
}

/**
 * Chỉ những key người vận hành thực sự đổi.
 *
 * Kéo đi rồi kéo về đúng chỗ cũ KHÔNG được tính là đổi: gửi một override trùng giá trị gốc
 * làm lượt chạy mang nhãn `policy-v1+ovr(...)` trong khi nó chạy đúng chính sách gốc, và
 * mọi so sánh về sau sẽ tưởng đó là hai chính sách khác nhau.
 */
export function pendingOverrides(metrics: PolicyMetrics | undefined, draft: PolicyOverrides): PolicyOverrides {
  if (!metrics) return {}
  const base = new Map(metrics.rules.map((rule) => [rule.key, rule]))
  const pending: Record<string, number> = {}
  for (const [key, value] of Object.entries(draft)) {
    const rule = base.get(key)
    if (!rule || !rule.tunable || typeof rule.value !== 'number') continue
    if (value !== rule.value) pending[key] = value
  }
  return pending
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
