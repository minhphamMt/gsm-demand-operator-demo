import { describe, expect, it } from 'vitest'

import { readPolicyMetrics } from './policyMetrics'

const payload = {
  version: '1.1',
  frozen_at: '2026-08-08',
  rules: { budget_cap: 500000, avg_vehicle_speed_kmh: 25, priority_zones: [] },
  meta: {
    budget_cap: { unit: 'VNĐ/plan', used_by: ['optimizer.greedy'], verified: false, owner: 'Data/BA', assumption: 'ASSUMPTION-02' },
    avg_vehicle_speed_kmh: { unit: 'km/h', used_by: ['optimizer.greedy'], verified: true, owner: 'Data/BA' },
    priority_zones: { unit: 'list[int] 1–30', used_by: ['optimizer.greedy'], verified: false, owner: 'BA' },
  },
  tunable: ['budget_cap'],
}

describe('readPolicyMetrics', () => {
  it('ghép giá trị với metadata của đúng key', () => {
    const metrics = readPolicyMetrics(payload)!

    const budget = metrics.rules.find((rule) => rule.key === 'budget_cap')!
    expect(budget.value).toBe(500000)
    expect(budget.unit).toBe('VNĐ/plan')
    expect(budget.assumption).toBe('ASSUMPTION-02')
    expect(metrics.version).toBe('1.1')
    expect(metrics.frozenAt).toBe('2026-08-08')
  })

  it('lấy `tunable` từ server chứ không tự suy', () => {
    // Suy lại ở client là chép luật `operator_tunable_keys` sang TypeScript; hai bản sẽ
    // trôi khỏi nhau và người dùng kéo xong một thanh mới nhận 422.
    const metrics = readPolicyMetrics(payload)!

    expect(metrics.rules.find((rule) => rule.key === 'budget_cap')!.tunable).toBe(true)
    expect(metrics.rules.find((rule) => rule.key === 'avg_vehicle_speed_kmh')!.tunable).toBe(false)
    expect(metrics.rules.find((rule) => rule.key === 'priority_zones')!.tunable).toBe(false)
  })

  it('giữ nguyên cờ verified để giao diện nói đúng lý do khoá', () => {
    const metrics = readPolicyMetrics(payload)!

    expect(metrics.rules.find((rule) => rule.key === 'avg_vehicle_speed_kmh')!.verified).toBe(true)
    expect(metrics.rules.find((rule) => rule.key === 'budget_cap')!.verified).toBe(false)
  })

  it('payload hỏng trả undefined thay vì một bảng nửa vời', () => {
    // Bảng thiếu key trông vẫn dùng được, nên nó nguy hiểm hơn hẳn một bảng trống.
    for (const broken of [undefined, null, {}, { rules: {} }, { rules: { a: 1 } }, { meta: {}, rules: {} }]) {
      expect(readPolicyMetrics(broken)).toBeUndefined()
    }
  })

  it('bỏ qua giá trị sai kiểu thay vì dựng một dòng rỗng', () => {
    const metrics = readPolicyMetrics({ ...payload, rules: { budget_cap: 500000, broken: { nested: true } } })!

    expect(metrics.rules.map((rule) => rule.key)).toEqual(['budget_cap'])
  })
})
