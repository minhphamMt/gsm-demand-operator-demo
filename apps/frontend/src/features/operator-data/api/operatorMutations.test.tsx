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
      await result.current.approve.mutateAsync({ planId: 'proposal-1', expectedVersion: 1 }).catch(() => undefined)
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'plans'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'audit'] })
    approve.mockRestore()
  })

  it('reconciles proposal and audit data after a 503 unknown outcome without retrying', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const revise = vi.spyOn(mockOperatorAdapter, 'revisePlan').mockRejectedValue(new AppError(
      'Máy chủ chưa xác nhận kết quả lưu.',
      { code: 'DATABASE_ERROR', status: 503 },
    ))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useOperatorActions(), { wrapper })

    await act(async () => {
      await result.current.revise.mutateAsync({
        planId: 'proposal-1',
        request: {
          expectedVersion: 1,
          moveQuantities: { 'move-1': 1 },
          moveSourceZoneIds: { 'move-1': 'AI-Z06' },
          targetDriverCount: 1,
          campaignDurationMinutes: 15,
          relocationBonus: 0,
          zoneTripBonus: 0,
          fareMultiplier: 1,
          budgetLimit: 0,
          note: 'Reconcile unknown outcome',
        },
      }).catch(() => undefined)
    })

    expect(revise).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'plans'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'audit'] })
    revise.mockRestore()
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

  it('refreshes snapshot and the complete execution flow after stopping a dispatch', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const cancelDispatch = vi.spyOn(mockOperatorAdapter, 'cancelDispatch').mockResolvedValue({ id: 'dispatch-1' } as never)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useOperatorActions(), { wrapper })

    await act(async () => {
      await result.current.cancelDispatch.mutateAsync({ batchId: 'dispatch-1', reason: 'Dừng để kiểm tra' })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'plans'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'campaigns'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'dispatch'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'offers'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'audit'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['operator', 'snapshot'] })
    cancelDispatch.mockRestore()
  })
})
