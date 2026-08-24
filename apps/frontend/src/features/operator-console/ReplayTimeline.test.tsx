import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReplayTimeline } from './ReplayTimeline'

const steps = [
  { sourceAt: '2026-09-25T08:10:00+07:00', meanRainMmH: 0.2 },
  { sourceAt: '2026-09-25T08:15:00+07:00', meanRainMmH: 0.8 },
]

describe('ReplayTimeline', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('requests the exact real bucket selected by the operator', async () => {
    const onSourceChange = vi.fn()
    render(<ReplayTimeline isLoading={false} onSourceChange={onSourceChange} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    await userEvent.click(screen.getByRole('button', { name: /08:15.*0.80 mm\/h/ }))
    expect(onSourceChange).toHaveBeenCalledWith(steps[1]!.sourceAt)
  })

  it('recognizes the selected bucket when the server serializes it as UTC', () => {
    render(<ReplayTimeline isLoading={false} onSourceChange={vi.fn()} selectedSourceAt="2026-09-25T01:10:00.000Z" steps={steps} />)

    expect(screen.getByRole('button', { name: /08:10.*0.20 mm\/h/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('locks timeline changes while observed data is loading', () => {
    cleanup()
    render(<ReplayTimeline isLoading onSourceChange={vi.fn()} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    expect(screen.getByRole('button', { name: /08:15.*0.80 mm\/h/ })).toBeDisabled()
    expect(screen.getByText('Đang đọc dữ liệu…')).toBeInTheDocument()
  })

  it('stops autoplay when a model step fails', async () => {
    cleanup()
    const view = render(<ReplayTimeline isLoading={false} onSourceChange={vi.fn()} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    await userEvent.click(screen.getByRole('button', { name: 'Phát replay' }))
    expect(screen.getByRole('button', { name: 'Tạm dừng replay' })).toBeInTheDocument()
    view.rerender(<ReplayTimeline hasError isLoading={false} onSourceChange={vi.fn()} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    expect(await screen.findByRole('button', { name: 'Phát replay' })).toBeInTheDocument()
    expect(screen.getByText('Đã dừng do lỗi')).toBeInTheDocument()
  })

  it('keeps autoplay scheduled when the dashboard refreshes its callback', () => {
    vi.useFakeTimers()
    const firstCallback = vi.fn()
    const view = render(<ReplayTimeline isLoading={false} onSourceChange={firstCallback} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)

    fireEvent.click(screen.getByRole('button', { name: /replay/ }))
    const refreshedCallback = vi.fn()
    view.rerender(<ReplayTimeline isLoading={false} onSourceChange={refreshedCallback} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    vi.advanceTimersByTime(1500)

    expect(refreshedCallback).toHaveBeenCalledWith(steps[1]!.sourceAt)
    expect(firstCallback).not.toHaveBeenCalled()
  })
})
