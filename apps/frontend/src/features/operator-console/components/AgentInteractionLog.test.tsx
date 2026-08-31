// Popup nhật ký agent — MA-6.7 và Chặng 7.
//
// Khẳng định quan trọng nhất vẫn là **không có nút hành động nào**, và giờ có thêm một vế:
// ô nhập cũng không phải cửa thứ hai vào cổng phê duyệt. Nó chỉ gọi `onAsk`; mọi ranh giới
// nằm ở server (chặn trước LLM) và ở allowlist directive của hook.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentInteractionLog } from '@/features/operator-console/components/AgentInteractionLog'
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

function show(rows: readonly LogRow[], props: Partial<Parameters<typeof AgentInteractionLog>[0]> = {}) {
  const onAsk = vi.fn()
  const view = render(
    <AgentInteractionLog isBusy={false} isRunning={false} onAsk={onAsk} rows={rows} thinking={[]} {...props} />,
  )
  return { onAsk, ...view }
}

describe('AgentInteractionLog', () => {
  afterEach(cleanup)

  it('luôn hiện dù chưa chạy lượt nào — nó là chỗ ra lệnh, không chỉ chỗ xem kết quả', () => {
    show([])

    expect(screen.getByRole('log')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ra lệnh hoặc hỏi agent' })).toBeInTheDocument()
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

    await userEvent.type(screen.getByRole('textbox', { name: 'Ra lệnh hoặc hỏi agent' }), 'zone nào thiếu xe{Enter}')

    expect(onAsk).toHaveBeenCalledWith('zone nào thiếu xe')
    expect(screen.getByRole('textbox', { name: 'Ra lệnh hoặc hỏi agent' })).toHaveValue('')
  })

  it('không gửi câu rỗng hay chỉ có khoảng trắng', async () => {
    const { onAsk } = show([])
    const box = screen.getByRole('textbox', { name: 'Ra lệnh hoặc hỏi agent' })

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
      <AgentInteractionLog isBusy={false} isRunning onAsk={onAsk} rows={[row(1), row(2), row(3), row(4)]} thinking={[]} />,
    )

    expect(screen.getByRole('button')).toHaveTextContent('2 dòng mới')
  })

  it('mở lại từ thanh thu gọn và xoá số dòng chưa đọc', async () => {
    const { rerender, onAsk } = show([row(1)], { isRunning: true })
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn nhật ký' }))
    rerender(<AgentInteractionLog isBusy={false} isRunning onAsk={onAsk} rows={[row(1), row(2)]} thinking={[]} />)

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
})
