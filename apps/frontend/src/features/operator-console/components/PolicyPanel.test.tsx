import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PolicyMetrics } from '@/features/operator-data'
import { PolicyPanel } from './PolicyPanel'

const metrics: PolicyMetrics = {
  version: '1.1',
  frozenAt: '2026-08-08',
  rules: [
    { key: 'budget_cap', value: 500000, unit: 'VNĐ/plan', usedBy: ['optimizer.greedy'], verified: false, owner: 'Data/BA', assumption: 'ASSUMPTION-02', tunable: true },
    { key: 'avg_vehicle_speed_kmh', value: 25, unit: 'km/h', usedBy: ['optimizer.greedy'], verified: true, owner: 'Data/BA', tunable: false },
    { key: 'incentive_base', value: 20000, unit: 'VNĐ', usedBy: ['activation.engine'], verified: false, owner: 'Data/BA', assumption: 'ASSUMPTION-10', tunable: true },
  ],
}

const panel = (props: Partial<Parameters<typeof PolicyPanel>[0]> = {}) => render(
  <PolicyPanel
    draft={{}}
    hasError={false}
    isLoading={false}
    metrics={metrics}
    onChange={vi.fn()}
    onReset={vi.fn()}
    {...props}
  />,
)

describe('PolicyPanel', () => {
  afterEach(cleanup)

  it('nói rõ ngưỡng chỉnh ở đây không ghi vào policy.yaml', () => {
    // Ranh giới quan trọng nhất của màn này. Một điều phối viên tưởng mình vừa đổi chính
    // sách của cả hệ thống là một hiểu nhầm tốn tiền — §13.2 bắt phải qua owner.
    panel()

    const region = screen.getByRole('region', { name: 'Chỉ số chính sách' })
    expect(region).toHaveTextContent('lượt tính tiếp theo')
    expect(region).toHaveTextContent('Không ghi vào')
    expect(region).toHaveTextContent('policy.yaml')
  })

  it('cho kéo ngưỡng chưa chốt', () => {
    const onChange = vi.fn()
    panel({ onChange })

    // `fireEvent.change` chứ không phải phím mũi tên: jsdom không cài đặt hành vi kéo của
    // `input[type=range]`, nên phím mũi tên không phát ra sự kiện nào để bắt.
    fireEvent.change(screen.getByLabelText('Ngân sách điều chuyển'), { target: { value: '400000' } })

    expect(onChange).toHaveBeenCalledWith('budget_cap', 400000)
  })

  it('khoá ngưỡng đã chốt và nói ra lý do', () => {
    // Nói đúng lý do thì người dùng biết phải hỏi ai, thay vì tưởng giao diện hỏng.
    panel()

    expect(screen.queryByLabelText('Tốc độ di chuyển trung bình')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chỉ số chính sách' }))
      .toHaveTextContent('Đã chốt bởi Data/BA — đổi cần owner duyệt')
  })

  it('đánh dấu giá trị đã đổi kèm giá trị gốc', () => {
    panel({ draft: { budget_cap: 400000 } })

    expect(screen.getByRole('region', { name: 'Chỉ số chính sách' })).toHaveTextContent('1 ĐÃ CHỈNH')
    expect(screen.getByText(/Gốc/)).toHaveTextContent('500.000')
  })

  it('không đếm là đã đổi khi kéo về đúng giá trị gốc', () => {
    panel({ draft: { budget_cap: 500000 } })

    expect(screen.queryByText(/ĐÃ CHỈNH/)).not.toBeInTheDocument()
  })

  it('chỉ bật nút đặt lại khi có thứ để đặt lại', async () => {
    const onReset = vi.fn()
    const { rerender } = panel({ onReset })
    expect(screen.getByRole('button', { name: /Đặt lại/ })).toBeDisabled()

    rerender(<PolicyPanel draft={{ budget_cap: 400000 }} hasError={false} isLoading={false} metrics={metrics} onChange={vi.fn()} onReset={onReset} />)
    await userEvent.click(screen.getByRole('button', { name: /Đặt lại/ }))

    expect(onReset).toHaveBeenCalled()
  })

  it('đọc policy hỏng thì báo, không bịa ngưỡng mặc định', () => {
    // Một bảng đầy số sai nguy hiểm hơn hẳn một bảng trống nói rõ là chưa đọc được.
    panel({ hasError: true, metrics: undefined })

    expect(screen.getByRole('status')).toHaveTextContent('Chưa đọc được bộ ngưỡng')
    expect(screen.queryByText('500.000 ₫')).not.toBeInTheDocument()
  })

  it('tách ngân sách điều chuyển khỏi ngân sách thưởng', () => {
    panel()

    expect(screen.getByText('Điều chuyển xe')).toBeInTheDocument()
    expect(screen.getByText('Kích hoạt tài xế')).toBeInTheDocument()
  })
})
