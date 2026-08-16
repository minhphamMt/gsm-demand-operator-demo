import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCurrentReplayAnchor } from './useCurrentReplayAnchor'

describe('useCurrentReplayAnchor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves to the new five-minute bucket using the projected server clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T09:48:00.000Z'))

    const { result } = renderHook(() => useCurrentReplayAnchor('2026-08-15T09:48:00.000Z', false))
    expect(result.current).toBe('2026-09-25T08:45:00+07:00')

    act(() => {
      vi.advanceTimersByTime(2 * 60_000 + 100)
    })

    expect(result.current).toBe('2026-09-25T08:50:00+07:00')
  })

  it('waits for capability state before falling back to the browser clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T09:48:00.000Z'))

    const { result, rerender } = renderHook(
      ({ isUnavailable }) => useCurrentReplayAnchor(undefined, isUnavailable),
      { initialProps: { isUnavailable: false } },
    )
    expect(result.current).toBeUndefined()

    rerender({ isUnavailable: true })
    expect(result.current).toBe('2026-09-25T08:45:00+07:00')
  })
})
