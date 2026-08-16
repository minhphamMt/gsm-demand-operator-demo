import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import type { Proposal, RevisePlanRequest } from '@/features/operator-data'
import { PlanDrawer } from './PlanDrawer'

describe('PlanDrawer', () => {
  let plan: Proposal

  beforeEach(async () => {
    cleanup()
    await mockOperatorAdapter.resetDemo()
    const loaded = await mockOperatorAdapter.getPlan('PLN-042')
    if (!loaded) throw new Error('Missing proposal fixture')
    plan = loaded
  })

  it('previews a vehicle change and saves it as a revised plan', async () => {
    const user = userEvent.setup()
    const onRevise = vi.fn<(request: RevisePlanRequest) => void>()
    const firstMove = plan.moves[0]!

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={onRevise} plan={plan} />)

    await user.click(screen.getByRole('button', { name: `Giảm xe ${firstMove.sourceZoneLabel} đến ${firstMove.targetZoneLabel}` }))

    expect(screen.getByRole('status', { name: `Số xe ${firstMove.sourceZoneLabel} đến ${firstMove.targetZoneLabel}` })).toHaveTextContent(String(firstMove.quantity - 1))
    expect(screen.getByRole('button', { name: 'Lưu điều chỉnh' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }))

    expect(onRevise).toHaveBeenCalledOnce()
    expect(onRevise.mock.calls[0]![0].moveQuantities[firstMove.id]).toBe(firstMove.quantity - 1)
  })

  it('shows immutable forecast and model-input provenance before review', () => {
    plan = { ...plan, planMode: 'ACTIVATION_ONLY', forecastRunId: 'run-immutable-1', modelInputId: 'input-immutable-1' }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText('run-immutable-1')).toBeInTheDocument()
    expect(screen.getByText('input-immutable-1')).toBeInTheDocument()
    expect(screen.getByText(plan.inputSnapshotId)).toBeInTheDocument()
    expect(screen.getByText(/Chế độ: chỉ activation/)).toBeInTheDocument()
  })

  it('labels a risk-p90 advisory plan and keeps it editable', () => {
    plan = {
      ...plan,
      warnings: [{
        id: 'RISK_ADVISORY_PROPOSAL',
        severity: 'info',
        title: 'RISK_ADVISORY_PROPOSAL',
        detail: 'Khuyến nghị sớm từ risk p90.',
      }],
    }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText(/BẢNG CHI TIẾT · KHUYẾN NGHỊ RISK P90/)).toBeInTheDocument()
    expect(screen.getByText(/các zone mục tiêu chưa đạt ngưỡng hotspot chính sách/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu điều chỉnh' })).toBeInTheDocument()
  })

  it('shows unavailable wait-time evidence as a dash instead of zero minutes', () => {
    plan = {
      ...plan,
      metricsBefore: { ...plan.metricsBefore, avgWaitProxy: 0 },
      metrics: { ...plan.metrics, avgWaitProxy: 0 },
    }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    const waitRow = screen.getByText('Phút chờ trung bình').closest('tr')
    expect(waitRow).toHaveTextContent('Phút chờ trung bình——')
    expect(waitRow).not.toHaveTextContent("0′")
  })

  it('explains direct relocation coverage and rounds model metrics for operators', () => {
    const { metricsAfterActivation: _metricsAfterActivation, ...relocationPlan } = plan
    plan = {
      ...relocationPlan,
      planMode: 'RELOCATION',
      targetDriverCount: 0,
      expectedOfferCount: 0,
      metricsBefore: { ...plan.metricsBefore, residualGap: 0.552, fulfillmentRate: 99.882, avgWaitProxy: 2.65 },
      metrics: { ...plan.metrics, residualGap: 0, fulfillmentRate: 100, avgWaitProxy: 2.649 },
    }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText(/mức phủ trực tiếp theo lời giải optimizer/)).toBeInTheDocument()
    expect(screen.getByText('Thiếu hụt mục tiêu').closest('tr')).toHaveTextContent('0,60')
    expect(screen.getByText('Tỷ lệ đáp ứng').closest('tr')).toHaveTextContent('99,9%100%')
  })

  it('shows the complete hybrid plan instead of presenting one route as the whole solution', () => {
    plan = {
      ...plan,
      planMode: 'HYBRID',
      targetDriverCount: 25,
      expectedOfferCount: 43,
      relocationBonus: 20_000,
      estimatedRewardCost: 40_000,
      moves: [{ ...plan.moves[0]!, quantity: 2, estimatedCost: 40_456 }],
      metricsBefore: { ...plan.metricsBefore, residualGap: 43 },
      metrics: { ...plan.metrics, residualGap: 41 },
      metricsAfterActivation: { ...plan.metrics, fulfillmentRate: 97.2, residualGap: 15.8 },
    }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText(/Chế độ: điều chuyển kết hợp activation/)).toBeInTheDocument()
    expect(screen.getByText(/2 xe điều chuyển an toàn \+ 43 offer/)).toBeInTheDocument()
    expect(screen.getByText(/kỳ vọng bổ sung 25,2 xe/)).toBeInTheDocument()
    expect(screen.getByText('ACTIVATION KỲ VỌNG').parentElement).toHaveTextContent('25,2 / 43 offer')
    expect(screen.getByText('CAM KẾT TỐI ĐA').parentElement).toHaveTextContent('900.456 ₫')
    expect(screen.getByText('Tỷ lệ đáp ứng').closest('tr')).toHaveTextContent('97,2%')
    expect(screen.getByRole('columnheader', { name: 'Sau activation (kỳ vọng)' })).toBeInTheDocument()
  })

  it('does not present a failed empty result as free instant 100% coverage', () => {
    plan = {
      ...plan,
      status: 'FailedGeneration',
      planMode: 'ACTIVATION_ONLY',
      moves: [],
      targetDriverCount: 0,
      metricsBefore: { ...plan.metricsBefore, residualGap: 0, fulfillmentRate: 100 },
      metrics: { ...plan.metrics, residualGap: 0, fulfillmentRate: 100 },
    }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText(/Chế độ: không có hành động khả thi/)).toBeInTheDocument()
    expect(screen.getByText(/Không có phương án điều phối để tính hiệu quả/)).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument()
    expect(screen.queryByText("0′")).not.toBeInTheDocument()
    expect(screen.queryByText('TÁC ĐỘNG DỰ KIẾN')).not.toBeInTheDocument()
  })
})
