import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScenarioComparison } from '@/features/operator-reports/components/ScenarioComparison'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import type { ScenarioComparison as ScenarioComparisonData } from '@/features/operator-data'

describe('scenario comparison selection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads the newly selected plan without leaving the previous result on screen', async () => {
    const plans = createAgentPlans('rain-peak').slice(0, 2).map((plan, index) => ({
      ...plan,
      forecastRunId: `forecast-${index + 1}`,
    }))
    const firstComparison: ScenarioComparisonData = {
      id: 'comparison-1',
      commonInputHash: 'same-input-hash-1',
      snapshotId: 'snapshot-1',
      forecastRunId: 'forecast-1',
      modelVersion: 'model-1',
      policyVersion: 'policy-1',
      scenarios: [
        { type: 'NO_ACTION', estimatedMetrics: { fulfillmentRate: 90, residualGap: 20 }, observedMetrics: null, uncertainty: {}, responseSource: 'forecast' },
        { type: 'RELOCATION', estimatedMetrics: { fulfillmentRate: 92, residualGap: 15 }, observedMetrics: null, uncertainty: {}, responseSource: 'optimizer' },
        { type: 'ACTIVATION', estimatedMetrics: { fulfillmentRate: 94, residualGap: 10 }, observedMetrics: null, uncertainty: {}, responseSource: 'policy' },
        { type: 'HYBRID', estimatedMetrics: { fulfillmentRate: 96, residualGap: 5 }, observedMetrics: null, uncertainty: {}, responseSource: 'hybrid' },
      ],
      hasObservedRevenue: false,
      revenueNotice: 'Chưa có dữ liệu doanh thu.',
    }
    let requestCount = 0
    const compare = vi.spyOn(mockOperatorAdapter, 'compareScenarios').mockImplementation(() => {
      requestCount += 1
      return requestCount === 1
        ? Promise.resolve(firstComparison)
        : new Promise<ScenarioComparisonData>(() => undefined)
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ScenarioComparison plans={plans} />
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'So sánh' }))
    expect(await screen.findByText('Đã chuẩn hóa cùng đầu vào')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Phương án so sánh' }), plans[1]!.id)

    await waitFor(() => expect(compare).toHaveBeenCalledWith(plans[1]!.id, expect.anything()))
    expect(screen.queryByText('Đã chuẩn hóa cùng đầu vào')).not.toBeInTheDocument()
    queryClient.clear()
  })
})
