import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CampaignList } from '@/features/operator-campaigns/components/CampaignList'
import { OperatorDashboard } from '@/features/operator-dashboard/components/OperatorDashboard'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { PlanDetail } from '@/features/operator-plans/components/PlanDetail'
import { PlanList } from '@/features/operator-plans/components/PlanList'
import { Reports } from '@/features/operator-reports/components/Reports'

function renderWithQueries(component: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter>{component}</MemoryRouter></QueryClientProvider>)
  return queryClient
}

describe('operator release query states', () => {
  beforeEach(async () => mockOperatorAdapter.resetDemo())
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it.each([
    ['dashboard', () => vi.spyOn(mockOperatorAdapter, 'getSnapshot').mockRejectedValue(new Error('offline')), () => <OperatorDashboard />],
    ['proposal list', () => vi.spyOn(mockOperatorAdapter, 'listPlans').mockRejectedValue(new Error('offline')), () => <PlanList />],
    ['campaign list', () => vi.spyOn(mockOperatorAdapter, 'listCampaigns').mockRejectedValue(new Error('offline')), () => <CampaignList />],
    ['report', () => vi.spyOn(mockOperatorAdapter, 'getOperationsReport').mockRejectedValue(new Error('offline')), () => <Reports />],
  ])('shows a safe retry when the %s initial query fails', async (_name, fail, renderComponent) => {
    fail()
    const queryClient = renderWithQueries(renderComponent())
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    queryClient.clear()
  })

  it('waits for and fails safely when a proposal detail dependency is unavailable', async () => {
    vi.spyOn(mockOperatorAdapter, 'listAudit').mockRejectedValue(new Error('offline'))
    const queryClient = renderWithQueries(<PlanDetail planId="PLN-042" />)
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByText(/Agent sinh/)).not.toBeInTheDocument()
    queryClient.clear()
  })
})
