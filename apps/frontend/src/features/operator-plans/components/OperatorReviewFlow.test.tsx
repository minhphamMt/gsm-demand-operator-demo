import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { PlanDetail } from '@/features/operator-plans/components/PlanDetail'
import { AppError } from '@/shared/api/client'

function ReviewRoute() {
  const { planId } = useParams()
  return planId ? <PlanDetail planId={planId} /> : null
}

describe('operator proposal review flow', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-15T08:00:00.000Z'))
    await mockOperatorAdapter.resetDemo()
  })

  it('preserves structured revision errors through the plan detail boundary', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.spyOn(mockOperatorAdapter, 'revisePlan').mockRejectedValueOnce(new AppError('Dữ liệu không hợp lệ.', {
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { budgetLimit: 'Hạn mức thưởng không hợp lệ.' } },
      requestId: 'revision-request-422',
      status: 422,
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [{ path: '/operator/plans/:planId', element: <ReviewRoute /> }],
      { initialEntries: ['/operator/plans/PLN-042'] },
    )

    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)

    await user.type(await screen.findByRole('textbox', { name: 'Lý do chỉnh sửa' }), 'Kiểm thử lỗi validation')
    await user.click(screen.getByRole('button', { name: /Lưu v2/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('revision-request-422')
    expect(screen.getByRole('spinbutton', { name: 'Hạn mức thưởng' })).toHaveAttribute('aria-invalid', 'true')
  }, 10_000)

  it('revises, approves and publishes offers in the required order', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter([
      { path: '/operator/plans/:planId', element: <ReviewRoute /> },
      { path: '/operator/campaigns', element: <h1>Chiến dịch huy động</h1> },
    ], { initialEntries: ['/operator/plans/PLN-042'] })

    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)

    await user.type(await screen.findByLabelText('Lý do chỉnh sửa'), 'Giữ nguyên cấu hình và xác nhận lại dữ liệu mới nhất')
    await user.click(screen.getByRole('button', { name: /Lưu v2/ }))
    await screen.findByText(/PLN-045 · v2 · Mô phỏng model tạo/)

    await user.click(screen.getByRole('button', { name: 'Phê duyệt phương án' }))
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: 'Duyệt phiên bản này' }))
    await screen.findByRole('button', { name: 'Thiết lập huy động thêm' })

    await user.click(screen.getByRole('button', { name: 'Thiết lập huy động thêm' }))
    expect(screen.getByText('5 tài xế')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Phát hành offer' }))
    await screen.findByRole('heading', { name: 'Chiến dịch huy động' })

    await waitFor(async () => {
      const campaigns = await mockOperatorAdapter.listCampaigns()
      expect(campaigns.some((campaign) => campaign.planId === 'PLN-045' && campaign.offersSent === 5)).toBe(true)
    })
  }, 10_000)
})
