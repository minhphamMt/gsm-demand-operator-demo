import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReplayTimeline } from './ReplayTimeline'

const steps = [
  { sourceAt: '2026-09-25T08:10:00+07:00', meanRainMmH: 0.2 },
  { sourceAt: '2026-09-25T08:15:00+07:00', meanRainMmH: 0.8 },
]

describe('ReplayTimeline', () => {
  it('requests the exact real bucket selected by the operator', async () => {
    const onSourceChange = vi.fn()
    render(<ReplayTimeline isLoading={false} onSourceChange={onSourceChange} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    await userEvent.click(screen.getByRole('button', { name: /08:15.*0.80 mm\/h/ }))
    expect(onSourceChange).toHaveBeenCalledWith(steps[1]!.sourceAt)
  })

  it('locks timeline changes while trained inference is running', () => {
    cleanup()
    render(<ReplayTimeline isLoading onSourceChange={vi.fn()} selectedSourceAt={steps[0]!.sourceAt} steps={steps} />)
    expect(screen.getByRole('button', { name: /08:15.*0.80 mm\/h/ })).toBeDisabled()
    expect(screen.getByText('Đang chạy LightGBM…')).toBeInTheDocument()
  })
})
