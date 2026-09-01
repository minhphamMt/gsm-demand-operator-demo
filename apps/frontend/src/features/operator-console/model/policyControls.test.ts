import { describe, expect, it } from 'vitest'

import type { PolicyMetrics, PolicyRule } from '@/features/operator-data'
import { formatRuleValue, pendingOverrides, policyGroups, sliderRange, snapToStep } from './policyControls'

const rule = (overrides: Partial<PolicyRule> & Pick<PolicyRule, 'key' | 'value'>): PolicyRule => ({
  unit: undefined, usedBy: [], verified: false, owner: 'Data/BA', assumption: undefined, tunable: true, ...overrides,
})

const metrics = (rules: readonly PolicyRule[]): PolicyMetrics => ({ version: '1.1', frozenAt: '2026-08-08', rules })

describe('policyGroups', () => {
  it('tách ngân sách điều chuyển khỏi ngân sách thưởng', () => {
    // C-09: hai trần ĐỘC LẬP, không bù trừ. Xếp chung một danh sách mời người đọc cộng
    // hai số thành "tổng ngân sách" — thứ không tồn tại.
    const groups = policyGroups(metrics([
      rule({ key: 'budget_cap', value: 500000, usedBy: ['optimizer.greedy'] }),
      rule({ key: 'incentive_budget_cap', value: 1000000, usedBy: ['activation.engine'] }),
    ]))

    expect(groups.map((group) => group.id)).toEqual(['relocation', 'activation'])
    expect(groups[0]!.rules.map((item) => item.key)).toEqual(['budget_cap'])
    expect(groups[1]!.rules.map((item) => item.key)).toEqual(['incentive_budget_cap'])
  })

  it('ngưỡng dùng chung xếp về nhóm điều chuyển', () => {
    // `min_supply_per_zone` được cả optimizer lẫn activation đọc; nó là ràng buộc điều xe
    // trước đã, nên hiện một lần ở nhóm điều chuyển thay vì hai lần ở hai nhóm.
    const groups = policyGroups(metrics([
      rule({ key: 'min_supply_per_zone', value: 3, usedBy: ['hotspot.detector', 'optimizer.constraints', 'activation.engine'] }),
    ]))

    expect(groups).toHaveLength(1)
    expect(groups[0]!.id).toBe('relocation')
  })

  it('bỏ nhóm rỗng thay vì hiện tiêu đề trống', () => {
    expect(policyGroups(metrics([rule({ key: 'budget_cap', value: 1, usedBy: ['optimizer.greedy'] })]))).toHaveLength(1)
  })
})

describe('sliderRange', () => {
  it('không cho kéo về 0 — server từ chối số không dương', () => {
    // Một thanh kéo tới chỗ chắc chắn lỗi 422 là cái bẫy, không phải điều khiển.
    for (const item of [rule({ key: 'budget_cap', value: 500000 }), rule({ key: 'min_supply_per_zone', value: 3 })]) {
      expect(sliderRange(item).min).toBeGreaterThan(0)
    }
  })

  it('giữ bước nguyên cho tiền — CLAUDE.md §5.2 cấm float cho tiền', () => {
    const range = sliderRange(rule({ key: 'budget_cap', value: 500000, unit: 'VNĐ/plan' }))

    expect(Number.isInteger(range.step)).toBe(true)
    expect(Number.isInteger(snapToStep(437_219, range))).toBe(true)
  })

  it('chặn tỷ lệ ở 1', () => {
    expect(sliderRange(rule({ key: 'assumed_accept_rate', value: 0.6, unit: 'tỷ lệ 0–1' })).max).toBe(1)
  })

  it('khoảng kéo bám theo giá trị gốc, không dùng một trần chung', () => {
    // Ngưỡng ở đây chênh nhau bốn bậc độ lớn; một trần dùng chung vừa vô dụng cho cái này
    // vừa nguy hiểm cho cái kia.
    expect(sliderRange(rule({ key: 'budget_cap', value: 500000 })).max).toBe(1_000_000)
    expect(sliderRange(rule({ key: 'min_supply_per_zone', value: 3 })).max).toBe(6)
  })
})

describe('snapToStep', () => {
  it('không sinh ra rác dấu phẩy động', () => {
    // 0.30000000000000004 gửi lên server là một giá trị người dùng không hề chọn.
    const range = sliderRange(rule({ key: 'assumed_accept_rate', value: 0.6, unit: 'tỷ lệ 0–1' }))

    expect(snapToStep(0.30000000000000004, range)).toBe(0.3)
    expect(String(snapToStep(0.35, range))).toBe('0.35')
  })
})

describe('formatRuleValue', () => {
  it('hiện tiền theo định dạng tiền, tỷ lệ theo phần trăm', () => {
    expect(formatRuleValue(rule({ key: 'budget_cap', value: 500000, unit: 'VNĐ/plan' }))).toContain('500.000')
    expect(formatRuleValue(rule({ key: 'assumed_accept_rate', value: 0.6, unit: 'tỷ lệ 0–1' }))).toContain('%')
  })

  it('nói rõ danh sách rỗng thay vì hiện một ô trống', () => {
    expect(formatRuleValue(rule({ key: 'priority_zones', value: [] }))).toBe('Chưa đặt')
    expect(formatRuleValue(rule({ key: 'priority_zones', value: [3, 7] }))).toBe('3, 7')
  })
})

describe('pendingOverrides', () => {
  const base = metrics([
    rule({ key: 'budget_cap', value: 500000 }),
    rule({ key: 'avg_vehicle_speed_kmh', value: 25, verified: true, tunable: false }),
  ])

  it('kéo đi rồi kéo về chỗ cũ không tính là đổi', () => {
    // Gửi override trùng giá trị gốc gắn nhãn `policy-v1+ovr(...)` cho một lượt chạy đúng
    // chính sách gốc, và mọi so sánh KPI sau đó tưởng đó là hai chính sách khác nhau.
    expect(pendingOverrides(base, { budget_cap: 500000 })).toEqual({})
  })

  it('giữ lại đúng key đã đổi', () => {
    expect(pendingOverrides(base, { budget_cap: 400000 })).toEqual({ budget_cap: 400000 })
  })

  it('bỏ qua key server không cho chỉnh', () => {
    // Kể cả khi state của màn hình có giá trị, thứ không `tunable` không được lên request:
    // server sẽ trả 422 sau khi người dùng đã thao tác xong.
    expect(pendingOverrides(base, { avg_vehicle_speed_kmh: 40 })).toEqual({})
  })

  it('chưa đọc được policy thì không gửi gì', () => {
    expect(pendingOverrides(undefined, { budget_cap: 400000 })).toEqual({})
  })
})
