import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuditHistory } from '@/features/operator-history/components/AuditHistory'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

function renderHistory(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/operator/history', element: <AuditHistory /> }], { initialEntries: [initialUrl] })
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

describe('AuditHistory', () => {
  beforeEach(async () => mockOperatorAdapter.resetDemo())
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('reads pagination from the URL and writes navigation back to it', async () => {
    const user = userEvent.setup()
    const router = renderHistory('/operator/history?page=2&pageSize=1')

    expect(await screen.findByText(/Trang 2\//)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(router.state.location.search).toBe('?pageSize=1')
  })

  it('shows an empty state for a valid filter with no matches', async () => {
    renderHistory('/operator/history?action=CampaignTargetReached')
    expect(await screen.findByText('Không có bản ghi phù hợp')).toBeInTheDocument()
  })

  it('shows a retry state when the paged API fails', async () => {
    vi.spyOn(mockOperatorAdapter, 'queryAudit').mockRejectedValueOnce(new Error('API unavailable'))
    renderHistory('/operator/history')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})
