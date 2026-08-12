import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RailActions } from '@/features/operator-console/OperatorConsoleDashboard'
import { proposalCoverageForStage } from '@/features/operator-console/model/proposalCoverage'
import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'

describe('operator console safety states', () => {
  it('shows expected activation coverage instead of a misleading 0% relocation value', () => {
    const source = createAgentPlans('rain-peak')[0]!
    const plan = {
      ...source,
      moves: [],
      metrics: { ...source.metricsBefore },
      metricsAfterActivation: { ...source.metricsBefore, residualGap: 0 },
    }

    expect(proposalCoverageForStage(plan, 'plan')).toEqual({
      label: 'MỨC PHỦ ĐIỀU CHUYỂN',
      percent: 0,
    })
    expect(proposalCoverageForStage(plan, 'activation_draft')).toEqual({
      label: 'MỨC PHỦ KỲ VỌNG',
      percent: 100,
    })
  })

  it('does not simulate completion when relocation dispatch is unavailable', () => {
    const plan = { ...createAgentPlans('rain-peak')[0]!, status: 'Approved' as const }
    const action = vi.fn()

    render(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={action}
      onApprove={action}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={plan}
      stage="approved"
    />)

    expect(screen.getByRole('button', { name: 'Chưa kết nối phát lệnh điều chuyển' })).toBeDisabled()
    expect(screen.getByText(/không tự đánh dấu hoàn tất/i)).toBeInTheDocument()
  })

  it('requires approval before a no-relocation activation can be released', async () => {
    const plan = { ...createAgentPlans('rain-peak')[0]!, moves: [] }
    const approve = vi.fn()
    const activate = vi.fn()
    const action = vi.fn()

    const view = render(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={activate}
      onApprove={approve}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={plan}
      stage="activation_draft"
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Phê duyệt bản nháp activation' }))
    expect(approve).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()

    view.rerender(<RailActions
      campaign={undefined}
      forecastReady
      isGenerating={false}
      isOptimizing={false}
      isScanning={false}
      onActivate={activate}
      onApprove={approve}
      onGenerate={action}
      onOpenCampaign={action}
      onOpenPlan={action}
      onOptimize={action}
      onPrepareActivation={action}
      onReject={action}
      plan={{ ...plan, status: 'Approved' }}
      stage="approved"
    />)

    await userEvent.click(screen.getByRole('button', { name: 'Phát hành offer activation' }))
    expect(activate).toHaveBeenCalledOnce()
  })
})
