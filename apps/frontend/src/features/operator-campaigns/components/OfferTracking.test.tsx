import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OfferTracking } from '@/features/operator-campaigns/components/OfferTracking'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

describe('OfferTracking', () => {
  beforeEach(async () => {
    await mockOperatorAdapter.resetDemo()
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('shows an explicit empty state when a status filter has no matching offers', async () => {
    const offers = await mockOperatorAdapter.listOffers()
    vi.spyOn(mockOperatorAdapter, 'listOffers').mockResolvedValue(offers.filter((offer) => offer.status === 'Open'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(<QueryClientProvider client={queryClient}><OfferTracking /></QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: 'Từ chối' }))
    expect(screen.getByText('Không có offer phù hợp')).toBeInTheDocument()
    queryClient.clear()
  })

  it('lets an operator expire an open offer and records the decision', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <OfferTracking />
      </QueryClientProvider>,
    )

    const expireButtons = await screen.findAllByRole('button', { name: 'Cho hết hạn' })
    await user.click(expireButtons[0]!)
    expect(screen.getByRole('dialog', { name: 'Cho offer hết hạn' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xác nhận hết hạn' }))

    await waitFor(async () => {
      expect((await mockOperatorAdapter.listOffers()).some((offer) => offer.status === 'Expired')).toBe(true)
    })
    expect((await mockOperatorAdapter.listAudit()).some((entry) => entry.action === 'OfferExpired')).toBe(true)
    queryClient.clear()
  })
})
