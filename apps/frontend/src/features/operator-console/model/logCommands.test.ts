// Lệnh gạch chéo của ô nhập.
//
// Hai test đắt nhất ở đây là hai ca mà một cách cài đơn giản hơn sẽ sai im lặng: lượt chạy mới
// dùng lại `seq` cũ, và dòng về đúng giây người ta gõ `/clear`. Cả hai đều làm mất dòng mà
// không báo gì — loại hỏng tệ nhất cho một nhật ký.

import { describe, expect, it } from 'vitest'

import {
  clearMark,
  clearedText,
  commandMenuMatches,
  exportText,
  gatesText,
  helpText,
  isDecisionRow,
  parseConsoleCommand,
  statusText,
  visibleRows,
  type ConsoleStatus,
} from '@/features/operator-console/model/logCommands'
import type { LogRow } from '@/features/operator-console/model/logRows'

const row = (seq: number, patch: Partial<LogRow> = {}): LogRow => ({
  origin: 'run',
  seq,
  at: `2026-08-28T17:02:${String(seq).padStart(2, '0')}+07:00`,
  kind: 'narration',
  actor: 'graph',
  text: `dòng ${seq}`,
  source: 'deterministic',
  ...patch,
})

describe('parseConsoleCommand', () => {
  it('câu thường đi tới agent', () => {
    expect(parseConsoleCommand('zone nào thiếu xe')).toEqual({ kind: 'ask', text: 'zone nào thiếu xe' })
  })

  it.each([
    ['/clear', 'clear'],
    ['/CLEAR', 'clear'],
    ['  /clear  ', 'clear'],
    ['/clear hết đi', 'clear'],
    ['/help', 'help'],
    ['/?', 'help'],
    ['/export', 'export'],
    ['/gates', 'gates'],
    ['/status', 'status'],
  ])('%s là lệnh của màn hình', (typed, kind) => {
    expect(parseConsoleCommand(typed).kind).toBe(kind)
  })

  it('lệnh lạ dừng ở client chứ không đi tới agent — gõ sai không tiêu một lượt gọi model', () => {
    expect(parseConsoleCommand('/approve')).toEqual({ kind: 'unknown', name: '/approve' })
  })

  it('không có lệnh nào chạm hai cổng §11.1', () => {
    for (const typed of ['/approve', '/reject', '/campaign', '/dispatch', '/offer']) {
      expect(parseConsoleCommand(typed).kind).toBe('unknown')
    }
  })
})

describe('commandMenuMatches', () => {
  it('gõ đúng một dấu / thì hiện đủ bảng lệnh', () => {
    expect(commandMenuMatches('/').map((command) => command.name))
      .toEqual(['/clear', '/export', '/gates', '/status', '/help'])
  })

  it('lọc dần theo tiền tố, không phân biệt hoa thường', () => {
    expect(commandMenuMatches('/g').map((c) => c.name)).toEqual(['/gates'])
    expect(commandMenuMatches('/S').map((c) => c.name)).toEqual(['/status'])
    expect(commandMenuMatches('/e').map((c) => c.name)).toEqual(['/export'])
  })

  it('đóng khi đang viết câu hỏi cho agent — gợi ý lệnh ở đó chỉ làm vướng', () => {
    expect(commandMenuMatches('zone nào thiếu xe')).toEqual([])
    expect(commandMenuMatches('')).toEqual([])
  })

  it('đóng khi đã gõ hết tên lệnh và sang khoảng trắng', () => {
    expect(commandMenuMatches('/clear ')).toEqual([])
  })

  it('đóng khi không khớp gì — để Enter cho ra câu "không có lệnh", rõ hơn menu trống', () => {
    expect(commandMenuMatches('/xyz')).toEqual([])
  })
})

describe('helpText', () => {
  it('nói rõ ô nhập không phê duyệt được — đúng chỗ người ta sẽ đi tìm câu trả lời đó', () => {
    expect(helpText()).toContain('KHÔNG gõ được ở đây')
  })

  it('liệt kê đủ lệnh và phím gọi lại', () => {
    const text = helpText()
    for (const name of ['/clear', '/export', '/gates', '/status', '/help', '↑ / ↓']) expect(text).toContain(name)
  })
})

describe('visibleRows', () => {
  it('không có dấu xoá thì không lọc gì', () => {
    const rows = [row(1), row(2)]
    expect(visibleRows(rows, null, null)).toEqual(rows)
  })

  it('giấu đúng những dòng đang hiện lúc gõ /clear', () => {
    const rows = [row(1), row(2)]
    const mark = clearMark(rows, '2026-08-28T17:02:05+07:00')

    expect(visibleRows(rows, mark, null)).toEqual([])
  })

  it('dòng tới sau vẫn hiện', () => {
    const rows = [row(1), row(2)]
    const mark = clearMark(rows, '2026-08-28T17:02:05+07:00')

    expect(visibleRows([...rows, row(9)], mark, null).map((r) => r.seq)).toEqual([9])
  })

  it('lượt chạy MỚI hiện đủ dù `seq` đếm lại từ 1', () => {
    // `usePipelineRun.start()` gọi `setEvents([])`, nên `run-1` của lượt sau trùng khoá với
    // `run-1` của lượt trước. Lọc theo mỗi khoá sẽ giấu trọn lượt chạy vừa bấm.
    const mark = clearMark([row(1), row(2)], '2026-08-28T17:02:05+07:00')
    const lastRun = [row(1, { at: '2026-08-28T17:09:00+07:00', text: 'lượt mới' })]

    expect(visibleRows(lastRun, mark, null).map((r) => r.text)).toEqual(['lượt mới'])
  })

  it('dòng về đúng giây gõ /clear mà chưa ai đọc thì vẫn hiện', () => {
    // `operatorNowIso()` cắt tới giây, nên lọc theo mỗi thời gian sẽ nuốt dòng này.
    const mark = clearMark([row(1)], '2026-08-28T17:02:05+07:00')
    const arrivedSameSecond = row(4, { at: '2026-08-28T17:02:05+07:00', text: 'vừa tới' })

    expect(visibleRows([arrivedSameSecond], mark, null).map((r) => r.text)).toEqual(['vừa tới'])
  })

  it('KHÔNG giấu dòng chờ duyệt còn treo — xoá màn hình không được làm mất việc chưa làm', () => {
    const gate = row(1, { origin: 'gate', kind: 'awaiting_approval', text: '⏸ chờ duyệt PLAN_B' })
    const rows = [row(1), gate]
    const mark = clearMark(rows, '2026-08-28T17:02:05+07:00')

    expect(visibleRows(rows, mark, 1).map((r) => r.text)).toEqual(['⏸ chờ duyệt PLAN_B'])
  })

  it('dòng chờ đã được quyết thì xoá bình thường', () => {
    const gate = row(1, { origin: 'gate', kind: 'awaiting_approval' })
    const mark = clearMark([gate], '2026-08-28T17:02:05+07:00')

    // `liveAwaitingSeq` trả `null` khi vòng chờ đã đóng, nên không còn gì để giữ lại.
    expect(visibleRows([gate], mark, null)).toEqual([])
  })
})

describe('clearedText', () => {
  it('nói rõ bản ghi kiểm toán không đổi — §9 #5 tách log khỏi History Store', () => {
    expect(clearedText(42, false)).toBe('đã xoá 42 dòng khỏi màn hình. Bản ghi kiểm toán ở CSDL không đổi.')
  })

  it('báo khi có dòng chờ duyệt được giữ lại', () => {
    expect(clearedText(3, true)).toContain('giữ lại dòng chờ duyệt')
  })
})

describe('exportText', () => {
  it('giữ đúng khuôn đang hiện trên màn hình', () => {
    const text = exportText([
      row(1, { actor: 'dispatch', text: '3 chặng, 6 xe' }),
      row(2, { origin: 'operator', kind: 'operator_message', text: 'chạy phân tích' }),
    ])

    expect(text).toBe('[17:02:01] [DISPATCH_AGENT] > 3 chặng, 6 xe\n[17:02:02] > chạy phân tích')
  })
})

describe('isDecisionRow', () => {
  it('giữ đúng bốn thứ CLAUDE.md §3 #7 gọi là quyết định', () => {
    expect(isDecisionRow(row(1, { origin: 'action', kind: 'operator_action' }))).toBe(true)
    expect(isDecisionRow(row(2, { kind: 'awaiting_approval' }))).toBe(true)
    expect(isDecisionRow(row(3, { origin: 'audit', kind: 'audit_record', actor: 'operator' }))).toBe(true)
    // Tài xế nhận/từ chối là quyền của tài xế (C-08) và là nửa còn lại của vòng phản hồi FR-13.
    expect(isDecisionRow(row(4, { origin: 'audit', kind: 'audit_record', actor: 'driver' }))).toBe(true)
  })

  it('bỏ tường thuật đồ thị, tool, và việc dọn dẹp của backend', () => {
    expect(isDecisionRow(row(1))).toBe(false)
    expect(isDecisionRow(row(2, { kind: 'tool_finished', actor: 'forecast' }))).toBe(false)
    expect(isDecisionRow(row(3, { origin: 'session', source: 'llm' }))).toBe(false)
    expect(isDecisionRow(row(4, { origin: 'audit', kind: 'audit_record', actor: 'execution' }))).toBe(false)
  })

  it('luôn giữ dòng của chính ô nhập — bộ lọc không được nuốt lời giải thích của nó', () => {
    expect(isDecisionRow(row(1, { origin: 'console', actor: 'console' }))).toBe(true)
  })
})

describe('gatesText', () => {
  it('nhắc cách tắt, vì bộ lọc là trạng thái dính', () => {
    expect(gatesText(true, 5)).toContain('/gates lần nữa để tắt')
    expect(gatesText(true, 0)).toContain('/gates lần nữa để tắt')
  })

  it('nói rõ khi chưa có quyết định nào, để màn hình trống không bị đọc thành hỏng', () => {
    expect(gatesText(true, 0)).toContain('chưa có quyết định nào')
  })

  it('câu tắt khẳng định nhật ký đã đủ lại', () => {
    expect(gatesText(false, 0)).toBe('đã tắt bộ lọc — nhật ký hiện lại đủ.')
  })
})

describe('statusText', () => {
  const status: ConsoleStatus = {
    observedAt: '2026-08-28T17:02:05+07:00',
    isLiveEdge: true,
    isStale: false,
    regime: 'rain_peak',
    zoneCount: 30,
    missingZoneCount: 0,
    forecastReady: true,
    horizonMinutes: 15,
    stage: 'plan',
    plan: { id: 'PLAN_B', version: 1, status: 'Proposed' },
    awaitingApproval: true,
  }

  it('in mốc, regime, dữ liệu, dự báo, phương án và bước', () => {
    const text = statusText(status)

    expect(text).toContain('17:02:05')
    expect(text).toContain('mốc mới nhất')
    expect(text).toContain('đủ 30/30 zone')
    expect(text).toContain('đã có cho horizon 15 phút')
    expect(text).toContain('PLAN_B v1 · Proposed')
    expect(text).toContain('đã có phương án, chờ duyệt')
  })

  it('giữ tên regime thô cạnh nhãn tiếng Việt — báo cáo gọi nó bằng `rain_peak`', () => {
    // §3 #6: `rain_peak` là thước đo thành công chính và không được giấu trong số tổng.
    expect(statusText(status)).toContain('mưa + cao điểm · (rain_peak)')
  })

  it('viết hoa cảnh báo khi thiếu zone hoặc snapshot đã cũ', () => {
    const text = statusText({ ...status, missingZoneCount: 4, isStale: true, isLiveEdge: false })

    expect(text).toContain('THIẾU 4/30 zone')
    expect(text).toContain('CŨ, cần làm mới')
    expect(text).toContain('đang xem lại mốc cũ')
  })

  it('nói "chưa có" chứ không bịa một phương án khi chưa có phương án nào', () => {
    const text = statusText({ ...status, plan: undefined, awaitingApproval: false, stage: 'observe' })

    expect(text).toContain('Phương án')
    expect(text).toContain('chưa có')
    expect(text).not.toContain('CHỜ BẠN DUYỆT')
  })
})
