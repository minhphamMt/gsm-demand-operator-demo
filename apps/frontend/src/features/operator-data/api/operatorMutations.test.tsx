import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { useOperatorActions } from '@/features/operator-data/api/operatorMutations'
import { AppError } from '@/shared/api/client'

describe('operator mutation conflicts', () => {
  it('refreshes proposal and audit data after a 409 conflict', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const approve = vi.spyOn(mockOperatorAdapter, 'approvePlan').mockRejectedValue(new AppError(
      'Proposal đã được đồng nghiệp xử lý.',
      { code: 'PROPOSAL_VERSION_CONFLICT', status: 409 },
    ))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useOperatorActions(), { wrapper })

    await act(async () => {
      await result.current.approve.mutateAsync({ planId: 'proposal-1' }).catch(() => undefined)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'plans'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'audit'] })
    approve.mockRestore()
  })

  it('refreshes the complete campaign and notification data flow after expiring an offer', async () => {
    await mockOperatorAdapter.resetDemo()
    const openOffer = (await mockOperatorAdapter.listOffers()).find((offer) => offer.status === 'Open')
    if (!openOffer) throw new Error('Missing open offer fixture')
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useOperatorActions(), { wrapper })

    await act(async () => {
      await result.current.expireOffer.mutateAsync(openOffer.id)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'campaigns'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'offers'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'audit'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver'] })
  })

  it('defaults release actions to real driver responses instead of simulation', async () => {
    await mockOperatorAdapter.resetDemo()
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const startCampaign = vi.spyOn(mockOperatorAdapter, 'startCampaign')
    const { result } = renderHook(() => useOperatorActions(), { wrapper })

    await act(async () => {
      await result.current.activate.mutateAsync('PLN-042').catch(() => undefined)
    })

    expect(startCampaign).toHaveBeenCalledWith('PLN-042', 'human')
  })
})
