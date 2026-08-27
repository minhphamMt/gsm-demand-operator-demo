import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PipelinePanel } from '@/features/operator-pipeline/components/PipelinePanel'
import { PlanSetComparison } from '@/features/operator-pipeline/components/PlanSetComparison'
import type { PipelinePlanSet, PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { planSummary } from '@/features/operator-pipeline/model/pipelineRun'

const planSet: PipelinePlanSet = {
  plans: [
    { plan_id: 'PLAN_A', strategy: 'MIN_COST', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
    { plan_id: 'PLAN_B', strategy: 'BALANCED', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
    { plan_id: 'PLAN_C', strategy: 'MIN_ETA', move_count: 6, total_units: 42, total_cost: 180_000, total_eta_step_units: 18, residual_zone_count: 2 },
  ],
  converged: true,
  distinct_plan_count: 1,
}

const doneRun: PipelineRunRecord = {
  run_id: 'RUN-1',
  status: 'DONE',
  routing_mode: 'deterministic',
  agents: {
    situation_assessment: {
      status: 'DONE',
      message: 'Đã đánh giá 30 zone.',
      capabilities: {
        forecast: { status: 'DONE', message: '' },
        traffic: { status: 'DONE', message: 'Mưa làm chậm 15% thời gian di chuyển' },
        supply: { status: 'WARNING', message: 'Còn 2 zone chưa đủ nguồn.' },
      },
    },
    dispatch: { status: 'DONE', message: '', capabilities: {} },
    optimization: { status: 'DONE', message: '', capabilities: {} },
    explanation: { status: 'DONE', message: '', capabilities: {} },
  },
  tool_calls: [
    { agent: 'situation_assessment', tool: 'run_forecast', ok: true, detail: '' },
    { agent: 'dispatch', tool: 'compute_relocation', ok: true, detail: '' },
  ],
  plan_set: planSet,
  recommended_plan_id: 'PLAN_B',
  quality_ok: true,
  explanation: { text: 'Điều 42 xe qua 6 chặng.', layer: 'template' },
}

describe('PipelinePanel', () => {
  afterEach(cleanup)

  it('renders the seven agent cards backed by real run data', () => {
    render(<PipelinePanel run={doneRun} />)

    for (const label of ['Forecast', 'Traffic', 'Supply', 'Situation Assessment', 'Dispatch', 'Optimization', 'Explanation']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('surfaces a capability warning message on its own card', () => {
    render(<PipelinePanel run={doneRun} />)

    expect(screen.getByText('Còn 2 zone chưa đủ nguồn.')).toBeInTheDocument()
  })

  it('shows every card as pending before a run starts', () => {
    render(<PipelinePanel run={undefined} />)

    expect(screen.getAllByText('Chờ')).toHaveLength(7)
  })

  it('asks the panel to focus an agent in the flow diagram', async () => {
    const focus = vi.fn()
    render(<PipelinePanel onFocusAgent={focus} run={doneRun} />)

    await userEvent.click(screen.getByRole('button', { name: 'Xem Dispatch trong sơ đồ' }))

    expect(focus).toHaveBeenCalledWith('dispatch')
  })

  it('labels the routing mode so the reviewer knows who chose the tools', () => {
    render(<PipelinePanel run={{ ...doneRun, routing_mode: 'llm' }} />)

    expect(screen.getByText('LLM tự chọn tool')).toBeInTheDocument()
  })
})

describe('PlanSetComparison', () => {
  afterEach(cleanup)

  it('shows one plan card plus a convergence banner when strategies converge', () => {
    render(<PlanSetComparison planSet={planSet} recommendedPlanId="PLAN_B" />)

    expect(screen.getByText('PLAN_B')).toBeInTheDocument()
    expect(screen.getByText(/Ba chiến lược/)).toBeInTheDocument()
    // Không hiện 3 thẻ giống hệt khi hội tụ.
    expect(screen.queryByText('PLAN_A')).not.toBeInTheDocument()
  })

  it('summarises the recommended plan', () => {
    expect(planSummary(planSet, 'PLAN_B')).toContain('42 xe')
  })
})
