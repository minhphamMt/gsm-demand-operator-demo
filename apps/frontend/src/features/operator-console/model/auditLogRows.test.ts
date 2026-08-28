import { describe, expect, it } from 'vitest'

import { AUDIT_PREFIX, auditActor, auditLogRows } from '@/features/operator-console/model/auditLogRows'
import type { AuditAction, AuditEntry } from '@/features/operator-data/model/types'

const entry = (action: AuditAction, patch: Partial<AuditEntry> = {}): AuditEntry => ({
  id: `A-${action}`,
  planId: 'PLAN_B',
  action,
  actor: 'system',
  occurredAt: '2026-08-28T17:05:00+07:00',
  detail: '',
  ...patch,
})

describe('auditActor', () => {
  it('tài xế nhận hay từ chối offer là quyết định CỦA HỌ, không phải bước thực thi', () => {
    // Từ chối là quyền của tài xế (C-08). Dán nhãn hệ thống lên nó là mô tả sai ai quyết định.
    expect(auditActor('OfferDeclined')).toBe('driver')
    expect(auditActor('OfferAccepted')).toBe('driver')
    expect(auditActor('OfferExpired')).toBe('driver')
  })

  it('duyệt / từ chối / chỉnh sửa là của người vận hành, không phải của backend', () => {
    expect(auditActor('Approved')).toBe('operator')
    expect(auditActor('Rejected')).toBe('operator')
    expect(auditActor('Revised')).toBe('operator')
  })

  it('phát lệnh và phát offer là việc backend làm, không phải agent nào trong đồ thị', () => {
    expect(auditActor('DispatchReleased')).toBe('execution')
    expect(auditActor('ActivationStarted')).toBe('execution')
    expect(auditActor('CampaignCancelled')).toBe('execution')
  })
})

describe('auditLogRows', () => {
  it('không có phương án thì không có dòng nào', () => {
    expect(auditLogRows([entry('DispatchReleased')], undefined)).toEqual([])
  })

  it('chỉ lấy bản ghi của đúng phương án đang xem', () => {
    const rows = auditLogRows([entry('DispatchReleased'), entry('Approved', { planId: 'PLAN_A' })], 'PLAN_B')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toContain('Phát lệnh điều chuyển')
  })

  it('bỏ việc dọn dẹp của hệ thống — chúng không phải quyết định của ai', () => {
    const rows = auditLogRows(
      [entry('Created'), entry('DemoReset'), entry('ScenarioLoaded'), entry('Approved')],
      'PLAN_B',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toContain('Phê duyệt proposal')
  })

  it('gắn tiền tố [LƯU] để phân biệt với dòng tức thì của client', () => {
    // Một lần bấm để lại hai dòng: "đã bấm" rồi "đã lưu". Trùng có chủ ý, không gộp.
    const rows = auditLogRows([entry('Approved')], 'PLAN_B')

    expect(rows[0]?.text.startsWith(AUDIT_PREFIX)).toBe(true)
    expect(rows[0]?.origin).toBe('audit')
  })

  it('đọc xuôi thời gian, dù audit trả về mới nhất trước', () => {
    const rows = auditLogRows(
      [
        entry('CampaignTargetReached', { occurredAt: '2026-08-28T17:09:00+07:00' }),
        entry('DispatchReleased', { occurredAt: '2026-08-28T17:05:00+07:00' }),
        entry('OfferAccepted', { occurredAt: '2026-08-28T17:07:00+07:00' }),
      ],
      'PLAN_B',
    )

    expect(rows.map((row) => row.actor)).toEqual(['execution', 'driver', 'execution'])
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3])
  })

  it('ghép chi tiết vào dòng khi có, và không để lại dấu gạch cụt khi không', () => {
    const [coDetail] = auditLogRows([entry('DispatchReleased', { detail: '6 chặng' })], 'PLAN_B')
    const [khongDetail] = auditLogRows([entry('DispatchReleased')], 'PLAN_B')

    expect(coDetail?.text).toContain('— 6 chặng')
    expect(khongDetail?.text.endsWith('Phát lệnh điều chuyển')).toBe(true)
  })
})
