import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { DriverExperience } from '@/features/driver-offers/components/DriverExperience'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'

describe('DriverExperience', () => {
  beforeEach(async () => {
    await mockOperatorAdapter.resetDemo()
  })

  it('moves an accepted offer from the inbox to the active journey', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <DriverExperience />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Nhận lời mời' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Nhận lời mời' })).not.toBeInTheDocument())
    expect(screen.getByText('Hiện chưa có lời mời nào')).toBeInTheDocument()
    expect(screen.getAllByText('Hoàn Kiếm').length).toBeGreaterThan(0)
  })
})
