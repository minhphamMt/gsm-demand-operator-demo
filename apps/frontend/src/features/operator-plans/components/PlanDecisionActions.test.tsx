import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlanDecisionActions } from '@/features/operator-plans/components/PlanDecisionActions'
import type { Proposal } from '@/features/operator-data'

const metrics = { fulfillmentRate: 80, residualGap: 10, deadheadKm: 2, budget: 100_000, expectedTrips: 10, avgWaitProxy: 5 }
const plan: Proposal = {
  id: 'PLN-TEST', rootProposalId: 'PLN-TEST', parentProposalId: null, title: 'Test', status: 'UnderReview', createdAt: '2026-08-05T09:00:00+07:00', version: 1, rank: 1, scenarioId: 'normal', generatorType: 'RULE_BASED', generatorVersion: 'test/1', inputSnapshotId: 'SNP-TEST', hotspotId: 'HOT-TEST', targetZoneId: 'zone-04', targetZoneLabel: 'Hoàn Kiếm', confidence: 0.9,
  candidateSourceZones: [], moves: [], simulationAvailable: true, targetDriverCount: 4, expectedOfferCount: 6, eligibleDriverCount: 4, averageDistanceKm: 2, averageEtaMinutes: 8, campaignDurationMinutes: 60, relocationBonus: 80_000, zoneTripBonus: 10_000, fareMultiplier: 1.1, budgetLimit: 1_000_000, estimatedRewardCost: 500_000, estimatedAdditionalRevenue: 100_000, estimatedNetCost: 400_000,
  policyChecks: [{ id: 'policy', label: 'Hợp lệ', passed: true, blocking: true, detail: 'OK' }], warnings: [], metricsBefore: { ...metrics, fulfillmentRate: 72, residualGap: 20 }, metrics, explanation: [], inputFreshUntil: new Date(Date.now() + 60_000).toISOString(),
}

describe('PlanDecisionActions', () => {
  afterEach(cleanup)

  it('requires a structured reason before rejecting a plan', async () => {
    const user = userEvent.setup()
    const onReject = vi.fn()
    render(<PlanDecisionActions plan={plan} isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={onReject} />)
    await user.click(screen.getByRole('button', { name: 'Từ chối' }))
    expect(screen.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled()
    await user.type(screen.getByLabelText('Giải thích bắt buộc'), 'Cần giảm deadhead')
    await user.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }))
    expect(onReject).toHaveBeenCalledWith({ reasonCode: 'budget', note: 'Cần giảm deadhead' })
  })

  it('requires the review checklist before approval', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    render(<PlanDecisionActions plan={plan} isWorking={false} onActivate={vi.fn()} onApprove={onApprove} onReject={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Phê duyệt phương án' }))
    const confirm = screen.getByRole('button', { name: 'Duyệt phiên bản này' })
    expect(confirm).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(confirm)
    expect(onApprove).toHaveBeenCalledWith('')
  })

  it('opens approval confirmation with the keyboard', async () => {
    const user = userEvent.setup()
    render(<PlanDecisionActions plan={plan} isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />)
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Phê duyệt phương án' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Xác nhận quyết định phê duyệt' })).toBeInTheDocument()
  })

  it('blocks approval for stale input or a failed policy check', () => {
    const { rerender } = render(<PlanDecisionActions plan={{ ...plan, inputFreshUntil: new Date(Date.now() - 60_000).toISOString() }} isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Phê duyệt phương án' })).toBeDisabled()

    rerender(<PlanDecisionActions plan={{ ...plan, policyChecks: [{ ...plan.policyChecks[0]!, passed: false }] }} isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Phê duyệt phương án' })).toBeDisabled()
  })

  it('does not offer duplicate activation after a campaign exists', () => {
    render(<PlanDecisionActions plan={{ ...plan, status: 'Approved' }} campaignStatus="Active" hasOperationalCampaign isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />)

    expect(screen.getByText('Campaign đang chạy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thiết lập huy động thêm' })).not.toBeInTheDocument()
  })

  it('blocks activation when an approved proposal has no AI target zone', () => {
    render(<PlanDecisionActions plan={{ ...plan, status: 'Approved', targetZoneId: null, targetZoneIds: [] }} isWorking={false} onActivate={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Thiết lập huy động thêm' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('proposal chưa có vùng mục tiêu AI')
  })
})
