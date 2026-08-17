import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'

describe('feedback states', () => {
  it('exposes empty, loading and retryable error states accessibly', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<><Skeleton className="h-4" /><EmptyState title="Trống" description="Chưa có bản ghi" /><ErrorState onRetry={retry} /></>)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(screen.getByText('Chưa có bản ghi')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('keeps cached content visible and offers a safe retry after a background refresh fails', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(<><p>Dữ liệu cache</p><DataRefreshState hasError isFetching={false} onRetry={retry} /></>)
    expect(screen.getByText('Dữ liệu cache')).toBeInTheDocument()
    expect(screen.getByText('Dữ liệu cũ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('announces a background refresh without replacing loaded content', () => {
    render(<DataRefreshState hasError={false} isFetching onRetry={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Đang đồng bộ')
  })
})
