import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { ProposalReviewForm } from '@/features/operator-plans/components/ProposalReviewForm'
import { AppError } from '@/shared/api/client'

describe('ProposalReviewForm API errors', () => {
  it('associates backend field errors with the affected controls', async () => {
    await mockOperatorAdapter.resetDemo()
    const plan = await mockOperatorAdapter.getPlan('PLN-042')
    if (!plan) throw new Error('Missing proposal fixture')
    const error = new AppError('Dữ liệu proposal không hợp lệ.', {
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: {
          budgetLimit: 'Hạn mức phải ít nhất bằng cam kết tối đa 250000 VND.',
          'sourcePlan.moves.0.drivers': 'Tổng số xe lấy từ vùng nguồn không được vượt quá 3.',
        },
      },
      requestId: 'operator-request-42',
      status: 422,
    })

    render(<ProposalReviewForm error={error} isSaving={false} plan={plan} onRevise={vi.fn()} />)

    expect(screen.getByLabelText('Hạn mức thưởng')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByLabelText('Số xe')[0]).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Hạn mức phải ít nhất/)).toBeInTheDocument()
    expect(screen.getByText(/Tổng số xe lấy từ vùng nguồn/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('operator-request-42')
  })
})
