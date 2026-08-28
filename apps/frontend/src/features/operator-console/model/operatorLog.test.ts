import { describe, expect, it } from 'vitest'

import {
  APPROVAL_RESOLVING_CODES,
  GATE_CAMPAIGN_CODE,
  GATE_PLAN_CODE,
  GATE_PLAN_REJECTED_CODE,
  failureDetail,
  operatorLogLine,
  type OperatorAction,
} from '@/features/operator-console/model/operatorLog'

const MOI_HANH_DONG: readonly OperatorAction[] = [
  'forecast', 'optimize', 'approve', 'reject', 'revise',
  'activate', 'release_dispatch', 'cancel_plan', 'stop_execution', 'retry_move',
]

describe('operatorLogLine', () => {
  it('nói việc đã xong, kèm định danh khi có', () => {
    const line = operatorLogLine('approve', 'ok', 'PLAN_B (v1)')

    expect(line.text).toBe('đã phê duyệt phương án PLAN_B (v1)')
    expect(line.ok).toBe(true)
  })

  it('hỏng thì nói là hỏng kèm lý do, không mượn câu chữ của lúc thành công', () => {
    const line = operatorLogLine('approve', 'failed', 'Phương án đã đổi phiên bản')

    expect(line.text).toBe('phê duyệt không thành — Phương án đã đổi phiên bản')
    expect(line.ok).toBe(false)
    // Dòng hỏng không được mang mã cổng: nó không phải một quyết định đã xảy ra.
    expect(line.code).toBeNull()
  })

  it.each(MOI_HANH_DONG)('%s có câu riêng cho cả hai kết cục', (action) => {
    const xong = operatorLogLine(action, 'ok')
    const hong = operatorLogLine(action, 'failed', 'mạng hỏng')

    expect(xong.text).not.toBe('')
    expect(hong.text).not.toBe('')
    expect(xong.text).not.toBe(hong.text)
    expect(xong.ok).toBe(true)
    expect(hong.ok).toBe(false)
  })

  it('đúng hai cổng §11.1 mang mã cổng — không hơn, không kém', () => {
    expect(operatorLogLine('approve', 'ok').code).toBe(GATE_PLAN_CODE)
    expect(operatorLogLine('activate', 'ok').code).toBe(GATE_CAMPAIGN_CODE)

    const khac = MOI_HANH_DONG.filter(
      (action) => ![GATE_PLAN_CODE, GATE_CAMPAIGN_CODE].includes(operatorLogLine(action, 'ok').code ?? ''),
    )
    expect(khac).not.toContain('approve')
    expect(khac).not.toContain('activate')
  })

  it('từ chối cũng mang mã, vì nó ĐÓNG vòng chờ dù không mở cổng nào', () => {
    expect(operatorLogLine('reject', 'ok').code).toBe(GATE_PLAN_REJECTED_CODE)
  })

  it('đúng duyệt và từ chối đóng được vòng chờ — revise thì không', () => {
    // Lưu bản chỉnh sửa sinh ra v2, và v2 vẫn phải được duyệt. Coi nó là đã xong sẽ tắt dòng
    // "đang chờ bạn" đúng lúc vẫn còn phải chờ.
    const dong = MOI_HANH_DONG.filter((action) =>
      APPROVAL_RESOLVING_CODES.includes(operatorLogLine(action, 'ok').code ?? ''),
    )

    expect(dong).toEqual(['approve', 'reject'])
    expect(dong).not.toContain('revise')
    expect(dong).not.toContain('activate')
  })

  it('không có định danh thì vẫn ra câu đọc được, không thừa khoảng trắng', () => {
    expect(operatorLogLine('optimize', 'ok').text).toBe('đã yêu cầu tối ưu phương án')
    expect(operatorLogLine('optimize', 'failed').text).toBe('tối ưu phương án không thành')
  })
})

describe('failureDetail', () => {
  it('lấy thông điệp của Error', () => {
    expect(failureDetail(new Error('Phiên bản không khớp'))).toBe('Phiên bản không khớp')
  })

  it.each([[new Error('   ')], [null], [undefined], ['chuỗi trần'], [{ message: 'giả Error' }]])(
    'thứ không dùng được thì nói không xác định thay vì để trống (%#)',
    (cause) => {
      expect(failureDetail(cause)).toBe('lỗi không xác định')
    },
  )
})
