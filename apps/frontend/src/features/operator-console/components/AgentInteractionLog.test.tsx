// Popup nhật ký agent — MA-6.7.
//
// Khẳng định quan trọng nhất ở đây không phải chuyện hiển thị mà là **popup không có nút hành
// động nào**: một nút duyệt nằm trong nhật ký là con đường thứ hai tới cổng phê duyệt §11.1,
// và nhật ký là khung nhìn quá khứ nên nó sẽ duyệt phải bản đã cũ.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentInteractionLog } from '@/features/operator-console/components/AgentInteractionLog'
import type { RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

const event = (seq: number, patch: Partial<RunEvent> = {}): RunEvent => ({
  seq,
  at: `2026-08-28T17:02:${String(seq).padStart(2, '0')}+07:00`,
  kind: 'narration',
  actor: 'graph',
  text: `dòng ${seq}`,
  source: 'deterministic',
  ...patch,
})

describe('AgentInteractionLog', () => {
  afterEach(cleanup)

  it('không chiếm chỗ khi chưa có lượt chạy nào', () => {
    const { container } = render(<AgentInteractionLog events={[]} isRunning={false} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('dựng đúng khuôn [giờ] [ACTOR] > nội dung', () => {
    render(<AgentInteractionLog events={[event(1, { actor: 'dispatch', text: '3 chặng, 6 xe' })]} isRunning={false} />)

    expect(screen.getByRole('log')).toHaveTextContent('[17:02:01] [DISPATCH_AGENT] > 3 chặng, 6 xe')
  })

  it('cắt giờ thẳng từ chuỗi ISO của server, không dựng lại Date theo múi giờ máy đang xem', () => {
    render(<AgentInteractionLog events={[event(7, { at: '2026-08-28T23:45:12+07:00' })]} isRunning={false} />)

    expect(screen.getByRole('log')).toHaveTextContent('[23:45:12]')
  })

  it('chia ba capability của situation_assessment theo tool, đúng như sơ đồ luồng chia', () => {
    render(
      <AgentInteractionLog
        events={[
          event(1, { actor: 'situation_assessment', tool: 'get_weather', kind: 'tool_started' }),
          event(2, { actor: 'situation_assessment', tool: 'run_forecast', kind: 'tool_started' }),
          event(3, { actor: 'situation_assessment', kind: 'agent_started' }),
        ]}
        isRunning={false}
      />,
    )

    const log = screen.getByRole('log')
    expect(log).toHaveTextContent('[TRAFFIC_AGENT]')
    expect(log).toHaveTextContent('[FORECAST_AGENT]')
    // Không có tool để suy ra capability thì ở lại thẻ tổng, không gán bừa.
    expect(log).toHaveTextContent('[SITUATION_AGENT]')
  })

  it('báo dòng do LLM viết để không lẫn với dòng dựng từ template', () => {
    render(<AgentInteractionLog events={[event(1, { source: 'llm', text: 'tôi đang kiểm tra thời tiết' })]} isRunning={false} />)

    expect(screen.getByRole('log')).toHaveTextContent('~llm')
  })

  it('công bố là vùng log sống để trình đọc màn hình đọc dòng mới', () => {
    render(<AgentInteractionLog events={[event(1)]} isRunning />)

    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite')
  })

  it('thu gọn rồi đếm số dòng tới sau đó', async () => {
    const { rerender } = render(<AgentInteractionLog events={[event(1), event(2)]} isRunning />)

    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn nhật ký' }))
    expect(screen.queryByRole('log')).not.toBeInTheDocument()

    rerender(<AgentInteractionLog events={[event(1), event(2), event(3), event(4)]} isRunning />)

    expect(screen.getByRole('button')).toHaveTextContent('2 dòng mới')
  })

  it('mở lại từ thanh thu gọn và xoá số dòng chưa đọc', async () => {
    const { rerender } = render(<AgentInteractionLog events={[event(1)]} isRunning />)
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn nhật ký' }))
    rerender(<AgentInteractionLog events={[event(1), event(2)]} isRunning />)

    await userEvent.click(screen.getByRole('button', { name: /Nhật ký agent/ }))

    expect(screen.getByRole('log')).toBeInTheDocument()
    expect(screen.queryByText(/dòng mới/)).not.toBeInTheDocument()
  })

  it('không mang bất kỳ nút hành động nào — đây là cửa thứ hai vào cổng phê duyệt', async () => {
    render(
      <AgentInteractionLog
        events={[event(1, { actor: 'optimization', text: '3 phương án đã chấm, khuyến nghị PLAN_B' })]}
        isRunning={false}
      />,
    )

    const buttons = within(screen.getByRole('region', { name: 'Nhật ký agent' })).getAllByRole('button')
    // Đúng một nút, và nó chỉ đổi cách nhìn.
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('Thu gọn nhật ký')

    for (const cam of [/duyệt/i, /phê duyệt/i, /từ chối/i, /chạy lại/i, /phát/i, /kích hoạt/i]) {
      expect(screen.queryByRole('button', { name: cam })).not.toBeInTheDocument()
    }
  })
})
