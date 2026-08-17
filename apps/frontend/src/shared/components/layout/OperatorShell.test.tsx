import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import type { OperatorCapabilities } from '@/features/operator-data'
import { OperatorShell } from './OperatorShell'

const capabilities: OperatorCapabilities = {
  serverTime: '2026-08-17T03:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  health: { api: 'ok', database: 'ok', ai: 'ok', map: 'ok' },
  capabilities: {
    forecastHorizons: { available: true, enabled: true, values: [5, 10, 15] },
    proposalReview: { available: true, enabled: true },
    dispatchRelease: { available: true, enabled: true },
    dispatchReconciliation: { available: true, enabled: true },
    activationRelease: { available: true, enabled: true },
    compensationSettlement: { available: true, enabled: true },
    scenarioComparison: { available: true, enabled: true },
  },
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('OperatorShell server clock', () => {
  it('continues advancing from the server timestamp after capabilities load', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T03:00:00.000Z'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['operator', 'capabilities'], capabilities)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/operator']}>
          <OperatorShell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const clock = () => container.querySelector('.nf-console-clock strong')

    expect(clock()).toHaveTextContent('10:00')

    act(() => vi.advanceTimersByTime(60_000))

    expect(clock()).toHaveTextContent('10:01')
  })
})
