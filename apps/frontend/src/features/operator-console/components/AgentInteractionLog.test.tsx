// Popup nhật ký agent — MA-6.7 và Chặng 7.
//
// Khẳng định quan trọng nhất vẫn là **không có nút hành động nào**, và giờ có thêm một vế:
// ô nhập cũng không phải cửa thứ hai vào cổng phê duyệt. Nó chỉ gọi `onAsk`; mọi ranh giới
// nằm ở server (chặn trước LLM) và ở allowlist directive của hook.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentInteractionLog } from '@/features/operator-console/components/AgentInteractionLog'
import type { ConsoleStatus } from '@/features/operator-console/model/logCommands'
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

function show(rows: readonly LogRow[], props: Partial<Parameters<typeof AgentInteractionLog>[0]> = {}) {
  const onAsk = vi.fn()
  const view = render(
    <AgentInteractionLog isBusy={false} isRunning={false} onAsk={onAsk} rows={rows} status={status} thinking={[]} {...props} />,
  )
  return { onAsk, ...view }
}

describe('AgentInteractionLog', () => {
  afterEach(cleanup)

  it('luôn hiện dù chưa chạy lượt nào — nó là chỗ ra lệnh, không chỉ chỗ xem kết quả', () => {
    show([])

    expect(screen.getByRole('log')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })).toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('Gõ chạy phân tích để agent bắt đầu')
  })

  it('dựng đúng khuôn [giờ] [ACTOR] > nội dung', () => {
    show([row(1, { actor: 'dispatch', text: '3 chặng, 6 xe' })])

    expect(screen.getByRole('log')).toHaveTextContent('[17:02:01] [DISPATCH_AGENT] > 3 chặng, 6 xe')
  })

  it('cắt giờ thẳng từ chuỗi ISO của server, không dựng lại Date theo múi giờ máy đang xem', () => {
    show([row(7, { at: '2026-08-28T23:45:12+07:00' })])

    expect(screen.getByRole('log')).toHaveTextContent('[23:45:12]')
  })

  it('chia ba capability của situation_assessment theo tool, đúng như sơ đồ luồng chia', () => {
    show([
      row(1, { actor: 'situation_assessment', tool: 'get_weather', kind: 'tool_started' }),
      row(2, { actor: 'situation_assessment', tool: 'run_forecast', kind: 'tool_started' }),
      row(3, { actor: 'situation_assessment', kind: 'agent_started' }),
    ])

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('[TRAFFIC_AGENT]')
    expect(log).toHaveTextContent('[FORECAST_AGENT]')
    expect(log).toHaveTextContent('[SITUATION_AGENT]')
  })

  it('câu người vận hành gõ hiện dạng dấu nhắc, không đội lốt một agent', () => {
    show([row(1, { origin: 'operator', actor: 'operator', kind: 'operator_message', text: 'chạy phân tích' })])

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('> chạy phân tích')
    expect(log).not.toHaveTextContent('[OPERATOR]')
  })

  it('thao tác đã bấm hiện dưới tên NGƯỜI VẬN HÀNH, không đội lốt agent nào', () => {
    show([row(1, {
      origin: 'action', actor: 'operator', kind: 'operator_action',
      text: 'đã phê duyệt phương án PLAN_B (v1)', ok: true, code: 'GATE_PLAN_APPROVED',
    })])

    expect(screen.getByRole('log')).toHaveTextContent('[NGƯỜI VẬN HÀNH] > đã phê duyệt phương án PLAN_B (v1)')
  })

  it('tô riêng hai cổng người-duyệt để đọc lại là thấy ngay ai quyết định gì', () => {
    const { container } = show([
      row(1, { origin: 'action', kind: 'operator_action', text: 'đã chạy dự báo', ok: true }),
      row(2, { origin: 'action', kind: 'operator_action', text: 'đã phê duyệt', ok: true, code: 'GATE_PLAN_APPROVED' }),
      row(3, { origin: 'action', kind: 'operator_action', text: 'đã phát hành campaign', ok: true, code: 'GATE_CAMPAIGN_CONFIRMED' }),
    ])

    // Đúng hai dòng mang cổng được tô, dòng điều hướng thì không.
    expect(container.querySelectorAll('.is-gate')).toHaveLength(2)
  })

  it('thao tác hỏng hiện như cảnh báo, không như một quyết định đã xảy ra', () => {
    const { container } = show([row(1, {
      origin: 'action', kind: 'warning', ok: false,
      text: 'phê duyệt không thành — Phương án đã đổi phiên bản',
    })])

    expect(container.querySelectorAll('.is-gate')).toHaveLength(0)
    expect(container.querySelectorAll('.is-bad')).toHaveLength(1)
    expect(screen.getByRole('log')).toHaveTextContent('Phương án đã đổi phiên bản')
  })

  // --- vòng chờ người duyệt (Chặng 6) ---

  it('dòng chờ nhấp nháy và báo trên tiêu đề khi còn đang chờ', () => {
    const { container } = show([row(1, {
      kind: 'awaiting_approval', actor: 'graph', source: 'system', code: 'AWAITING_APPROVAL',
      text: '⏸ chờ người vận hành duyệt PLAN_B — hệ thống không tự quyết',
    })])

    expect(container.querySelectorAll('.is-waiting')).toHaveLength(1)
    expect(screen.getByRole('log')).toHaveTextContent('hệ thống không tự quyết')
    expect(screen.getByText('chờ bạn duyệt')).toBeInTheDocument()
  })

  it('duyệt xong thì dòng chờ thành lịch sử tĩnh, không nhấp nháy nữa', () => {
    const { container } = show([
      row(1, { kind: 'awaiting_approval', actor: 'graph', source: 'system', text: '⏸ chờ duyệt' }),
      row(2, {
        origin: 'action', kind: 'operator_action', actor: 'operator',
        text: 'đã phê duyệt phương án PLAN_B (v1)', ok: true, code: 'GATE_PLAN_APPROVED',
      }),
    ])

    // Để nó nhấp nháy mãi là nói rằng hệ thống vẫn đang đợi một việc đã xong.
    expect(container.querySelectorAll('.is-waiting')).toHaveLength(0)
    expect(screen.queryByText('chờ bạn duyệt')).not.toBeInTheDocument()
  })

  it('báo dòng do LLM viết để không lẫn với dòng dựng từ template', () => {
    show([row(1, { source: 'llm', text: 'tôi đang kiểm tra thời tiết' })])

    expect(screen.getByRole('log')).toHaveTextContent('~llm')
  })

  it('công bố là vùng log sống để trình đọc màn hình đọc dòng mới', () => {
    show([row(1)], { isRunning: true })

    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite')
  })

  // --- ô nhập ---

  it('gửi câu đã gõ rồi xoá ô nhập', async () => {
    const { onAsk } = show([])

    await userEvent.type(screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' }), 'zone nào thiếu xe{Enter}')

    expect(onAsk).toHaveBeenCalledWith('zone nào thiếu xe')
    expect(screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })).toHaveValue('')
  })

  it('không gửi câu rỗng hay chỉ có khoảng trắng', async () => {
    const { onAsk } = show([])
    const box = screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })

    await userEvent.type(box, '{Enter}')
    await userEvent.type(box, '    {Enter}')

    expect(onAsk).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
  })

  // --- ranh giới ---

  it('không mang nút hành động nào — ô nhập không phải cửa thứ hai vào cổng phê duyệt', () => {
    show([row(1, { actor: 'optimization', text: '3 phương án đã chấm, khuyến nghị PLAN_B' })])

    const region = within(screen.getByRole('region', { name: 'Nhật ký agent' }))
    // Đúng hai nút: thu gọn (đổi cách nhìn) và gửi (đưa chữ cho agent quan sát chỉ-đọc).
    expect(region.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Thu gọn nhật ký',
      'Gửi',
    ])

    for (const cam of [/duyệt/i, /phê duyệt/i, /từ chối/i, /phát offer/i, /kích hoạt/i]) {
      expect(screen.queryByRole('button', { name: cam })).not.toBeInTheDocument()
    }
  })

  it('hiện nguyên văn lời từ chối của server khi bị hỏi chuyện phê duyệt', () => {
    show([row(1, {
      origin: 'session',
      actor: 'observer',
      code: 'GATE_IS_UI_ONLY',
      ok: false,
      text: 'Việc phê duyệt và phát hành offer không gõ được ở đây.',
    })])

    expect(screen.getByRole('log')).toHaveTextContent('không gõ được ở đây')
  })

  // --- thu gọn ---

  it('thu gọn rồi đếm số dòng tới sau đó', async () => {
    const { rerender, onAsk } = show([row(1), row(2)], { isRunning: true })

    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn nhật ký' }))
    expect(screen.queryByRole('log')).not.toBeInTheDocument()

    rerender(
      <AgentInteractionLog isBusy={false} isRunning onAsk={onAsk} rows={[row(1), row(2), row(3), row(4)]} status={status} thinking={[]} />,
    )

    expect(screen.getByRole('button')).toHaveTextContent('2 dòng mới')
  })

  it('mở lại từ thanh thu gọn và xoá số dòng chưa đọc', async () => {
    const { rerender, onAsk } = show([row(1)], { isRunning: true })
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn nhật ký' }))
    rerender(<AgentInteractionLog isBusy={false} isRunning onAsk={onAsk} rows={[row(1), row(2)]} status={status} thinking={[]} />)

    await userEvent.click(screen.getByRole('button', { name: /Nhật ký agent/ }))

    expect(screen.getByRole('log')).toBeInTheDocument()
    expect(screen.queryByText(/dòng mới/)).not.toBeInTheDocument()
  })

  it('nêu tên agent đang chạy trong lúc chờ câu trả lời', () => {
    // Khoảng lặng giữa lúc gõ xong và lúc câu trả lời hiện ra dài vài giây. Không có dòng này
    // thì nó trông hệt như hệ thống đã chết, và người vận hành sẽ gõ lại câu vừa gõ.
    show([row(1, { origin: 'operator', text: 'zone nào đang thiếu xe' })], {
      thinking: [row(2, { origin: 'session', kind: 'agent_started', actor: 'observer' })],
    })

    const region = within(screen.getByRole('region', { name: 'Nhật ký agent' }))
    expect(region.getByText(/đang suy nghĩ/)).toBeInTheDocument()
    expect(region.getByText('[OBSERVER]')).toBeInTheDocument()
  })

  it('gọi đúng tên từng agent của đồ thị, không gộp thành một', () => {
    show([], { thinking: [row(1, { kind: 'agent_started', actor: 'optimization' })] })

    expect(screen.getByText('[OPTIMIZATION_AGENT]')).toBeInTheDocument()
  })

  it('không có dòng chờ nào khi không agent nào đang chạy', () => {
    show([row(1)])

    expect(screen.queryByText(/đang suy nghĩ/)).not.toBeInTheDocument()
  })

  // --- lệnh gạch chéo ---

  const type = (text: string) =>
    userEvent.type(screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' }), text)

  it('/clear xoá nhật ký khỏi màn hình mà không gửi gì cho agent', async () => {
    const { onAsk } = show([row(1), row(2), row(3)])

    await type('/clear{Enter}')

    const log = screen.getByRole('log')
    expect(log).not.toHaveTextContent('dòng 1')
    expect(log).toHaveTextContent('đã xoá 3 dòng khỏi màn hình')
    // Ranh giới của cả tính năng: lệnh của màn hình không đi qua cửa của agent.
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('/clear nói rõ bản ghi kiểm toán không đổi — nó dọn màn hình, không xoá dấu vết', async () => {
    show([row(1)])

    await type('/clear{Enter}')

    expect(screen.getByRole('log')).toHaveTextContent('Bản ghi kiểm toán ở CSDL không đổi')
  })

  it('dòng tới sau /clear vẫn hiện', async () => {
    const { rerender, onAsk } = show([row(1), row(2)])
    await type('/clear{Enter}')

    rerender(
      <AgentInteractionLog isBusy={false} isRunning={false} onAsk={onAsk} rows={[row(1), row(2), row(9)]} status={status} thinking={[]} />,
    )

    expect(screen.getByRole('log')).toHaveTextContent('dòng 9')
    expect(screen.getByRole('log')).not.toHaveTextContent('dòng 1')
  })

  it('/clear GIỮ dòng chờ duyệt còn treo — không được dọn mất một việc chưa làm', async () => {
    const { container } = show([
      row(1),
      row(2, { origin: 'gate', kind: 'awaiting_approval', text: '⏸ chờ người vận hành duyệt PLAN_B' }),
    ])

    await type('/clear{Enter}')

    expect(screen.getByRole('log')).toHaveTextContent('⏸ chờ người vận hành duyệt PLAN_B')
    expect(container.querySelectorAll('.is-waiting')).toHaveLength(1)
    expect(screen.getByText('chờ bạn duyệt')).toBeInTheDocument()
  })

  it('/help liệt kê lệnh và nói rõ không phê duyệt được từ ô nhập', async () => {
    const { onAsk } = show([])

    await type('/help{Enter}')

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('/clear')
    expect(log).toHaveTextContent('KHÔNG gõ được ở đây')
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('lệnh lạ dừng ở màn hình, không tiêu một lượt gọi agent', async () => {
    const { onAsk } = show([])

    await type('/approve{Enter}')

    expect(screen.getByRole('log')).toHaveTextContent('không có lệnh /approve')
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('câu thường vẫn đi tới agent như cũ', async () => {
    const { onAsk } = show([])

    await type('zone nào thiếu xe{Enter}')

    expect(onAsk).toHaveBeenCalledWith('zone nào thiếu xe')
  })

  it('/export chép nhật ký đang hiện vào clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    show([row(1, { actor: 'dispatch', text: '3 chặng, 6 xe' })])

    await type('/export{Enter}')

    expect(writeText).toHaveBeenCalledWith('[17:02:01] [DISPATCH_AGENT] > 3 chặng, 6 xe')
    expect(await screen.findByText(/đã chép \d+ dòng vào clipboard/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('↑ gọi lại câu vừa gõ, ↓ trả về dòng trắng', async () => {
    show([])
    const box = screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })

    await userEvent.type(box, 'chạy dự báo{Enter}')
    await userEvent.type(box, '{ArrowUp}')
    expect(box).toHaveValue('chạy dự báo')

    await userEvent.type(box, '{ArrowDown}')
    expect(box).toHaveValue('')
  })

  it('↑ đi ngược dần qua lịch sử', async () => {
    show([])
    const box = screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })

    await userEvent.type(box, 'câu một{Enter}')
    await userEvent.type(box, 'câu hai{Enter}')

    await userEvent.type(box, '{ArrowUp}')
    expect(box).toHaveValue('câu hai')
    await userEvent.type(box, '{ArrowUp}')
    expect(box).toHaveValue('câu một')
  })

  it('/status in trạng thái vận hành mà không gọi agent', async () => {
    const { onAsk } = show([])

    await type('/status{Enter}')

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('17:02:05')
    expect(log).toHaveTextContent('rain_peak')
    expect(log).toHaveTextContent('PLAN_B v1 · Proposed')
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('/gates chỉ giữ quyết định của con người, bỏ tường thuật của đồ thị', async () => {
    show([
      row(1, { actor: 'optimization', text: '3 phương án đã chấm' }),
      row(2, { origin: 'action', kind: 'operator_action', actor: 'operator', text: 'đã phê duyệt PLAN_B', ok: true, code: 'GATE_PLAN_APPROVED' }),
      row(3, { origin: 'audit', kind: 'audit_record', actor: 'driver', text: '[LƯU] tài xế nhận offer' }),
    ])

    await type('/gates{Enter}')

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('đã phê duyệt PLAN_B')
    expect(log).toHaveTextContent('tài xế nhận offer')
    expect(log).not.toHaveTextContent('3 phương án đã chấm')
  })

  it('/gates hiện huy hiệu trên tiêu đề — nhật ký lọc âm thầm là nhật ký nói dối', async () => {
    show([row(1)])

    await type('/gates{Enter}')

    expect(screen.getByText('chỉ quyết định')).toBeInTheDocument()
  })

  it('/gates lần thứ hai tắt bộ lọc và hiện lại đủ', async () => {
    show([row(1, { text: 'tường thuật của đồ thị' })])

    await type('/gates{Enter}')
    expect(screen.getByRole('log')).not.toHaveTextContent('tường thuật của đồ thị')

    await type('/gates{Enter}')
    expect(screen.getByRole('log')).toHaveTextContent('tường thuật của đồ thị')
    expect(screen.queryByText('chỉ quyết định')).not.toBeInTheDocument()
  })

  it('/gates trên nhật ký chưa có quyết định nào vẫn nói rõ vì sao trống', async () => {
    show([row(1, { text: 'chỉ có tường thuật' })])

    await type('/gates{Enter}')

    // Không có dòng nào lọt bộ lọc, nhưng câu xác nhận của chính ô nhập thì phải còn —
    // màn hình trống trơn không lời giải thích sẽ bị đọc thành hỏng.
    expect(screen.getByRole('log')).toHaveTextContent('chưa có quyết định nào')
  })

  it('/export chép đúng phần đang hiện, nên /gates rồi /export ra biên bản quyết định', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    show([
      row(1, { actor: 'optimization', text: '3 phương án đã chấm' }),
      row(2, { origin: 'action', kind: 'operator_action', actor: 'operator', text: 'đã phê duyệt PLAN_B', ok: true }),
    ])

    await type('/gates{Enter}')
    await type('/export{Enter}')

    const copied = writeText.mock.calls[0]![0] as string
    expect(copied).toContain('đã phê duyệt PLAN_B')
    expect(copied).not.toContain('3 phương án đã chấm')
    vi.unstubAllGlobals()
  })

  // --- menu gõ `/` ---

  const box = () => screen.getByRole('combobox', { name: 'Ra lệnh hoặc hỏi agent' })

  it('gõ / bật menu đủ bảng lệnh, kèm mô tả từng lệnh', async () => {
    show([])

    await type('/')

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('/clear'),
      expect.stringContaining('/export'),
      expect.stringContaining('/gates'),
      expect.stringContaining('/status'),
      expect.stringContaining('/help'),
    ])
    expect(options[0]).toHaveTextContent('bản ghi ở CSDL không đổi')
    expect(box()).toHaveAttribute('aria-expanded', 'true')
  })

  it('lọc dần theo chữ gõ thêm', async () => {
    show([])

    await type('/g')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('/gates')
  })

  it('không bật menu khi đang viết câu hỏi cho agent', async () => {
    show([])

    await type('zone nào')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box()).toHaveAttribute('aria-expanded', 'false')
  })

  it('↑↓ lái menu và công bố mục đang tô cho trình đọc màn hình', async () => {
    show([])
    await type('/')

    expect(box()).toHaveAttribute('aria-activedescendant', 'nf-agent-log-cmd-clear')

    await type('{ArrowDown}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'nf-agent-log-cmd-export')

    await type('{ArrowUp}')
    expect(box()).toHaveAttribute('aria-activedescendant', 'nf-agent-log-cmd-clear')
  })

  it('↑ ở đầu danh sách vòng xuống cuối, không kẹt', async () => {
    show([])
    await type('/')

    await type('{ArrowUp}')

    expect(box()).toHaveAttribute('aria-activedescendant', 'nf-agent-log-cmd-help')
  })

  it('Enter chạy lệnh ĐANG TÔ, nên gõ /g rồi Enter ra /gates', async () => {
    show([row(1, { text: 'tường thuật của đồ thị' })])

    await type('/g{Enter}')

    expect(screen.getByText('chỉ quyết định')).toBeInTheDocument()
  })

  it('Enter khi mới gõ / chạy lệnh đầu danh sách, không báo "không có lệnh"', async () => {
    show([row(1), row(2)])

    await type('/{Enter}')

    expect(screen.getByRole('log')).toHaveTextContent('đã xoá 2 dòng khỏi màn hình')
  })

  it('Tab điền nốt tên lệnh mà chưa chạy — còn kịp đọc lại trước khi Enter', async () => {
    show([])

    await type('/s{Tab}')

    expect(box()).toHaveValue('/status')
    expect(screen.getByRole('log')).not.toHaveTextContent('Mốc đang xem')
  })

  it('bấm chuột vào một mục thì chạy đúng lệnh đó', async () => {
    show([])
    await type('/')

    await userEvent.click(screen.getByRole('option', { name: /\/status/ }))

    expect(screen.getByRole('log')).toHaveTextContent('rain_peak')
  })

  it('Esc đóng menu mà không xoá chữ đang gõ', async () => {
    show([])
    await type('/cl')

    await type('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box()).toHaveValue('/cl')
  })

  it('gõ tiếp sau Esc thì menu mở lại — Esc bỏ qua gợi ý, không tắt hẳn tính năng', async () => {
    show([])
    await type('/cl{Escape}')

    await type('e')

    expect(screen.getByRole('option')).toHaveTextContent('/clear')
  })

  it('menu mở thì ↑ lái menu chứ không gọi lại lịch sử', async () => {
    show([])
    await userEvent.type(box(), 'chạy dự báo{Enter}')

    await type('/')
    await type('{ArrowUp}')

    // Chữ trong ô vẫn là `/`; nếu ↑ gọi lịch sử thì nó đã thành 'chạy dự báo'.
    expect(box()).toHaveValue('/')
  })

  it('vẫn không có nút hành động nào sau khi thêm lệnh — lệnh gõ, không bấm', async () => {
    show([row(1)])

    await type('/help{Enter}')

    const region = within(screen.getByRole('region', { name: 'Nhật ký agent' }))
    expect(region.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Thu gọn nhật ký',
      'Gửi',
    ])
  })
})
