import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PlanComparisonBars } from '@/features/operator-pipeline/components/PlanComparisonBars'
import type { PipelinePlan } from '@/features/operator-pipeline/model/pipelineRun'

const plan = (id: string, strategy: string, cost: number, units: number): PipelinePlan => ({
  plan_id: id,
  strategy,
  move_count: 6,
  total_units: units,
  total_cost: cost,
  total_eta_step_units: 18,
  residual_zone_count: 2,
})

describe('PlanComparisonBars', () => {
  afterEach(cleanup)

  it('stays hidden when the strategies converged into one plan', () => {
    const { container } = render(<PlanComparisonBars plans={[plan('PLAN_B', 'BALANCED', 180_000, 42)]} recommendedPlanId="PLAN_B" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('prints the real value of every plan next to its bar', () => {
    render(
      <PlanComparisonBars
        plans={[plan('PLAN_A', 'MIN_COST', 120_000, 30), plan('PLAN_B', 'BALANCED', 180_000, 42)]}
        recommendedPlanId="PLAN_B"
      />,
    )

    const costRow = screen.getByText('Chi phí').parentElement
    expect(within(costRow!).getByText(/120\.000/)).toBeInTheDocument()
    expect(within(costRow!).getByText(/180\.000/)).toBeInTheDocument()
  })

  // Bốn chỉ số khác đơn vị nên mỗi hàng chuẩn hoá riêng; gộp chung một trục sẽ so sai.
  it('normalises each metric row on its own scale', () => {
    render(
      <PlanComparisonBars
        plans={[plan('PLAN_A', 'MIN_COST', 120_000, 30), plan('PLAN_B', 'BALANCED', 180_000, 60)]}
        recommendedPlanId="PLAN_B"
      />,
    )

    const unitsRow = screen.getByText('Xe điều').parentElement
    const bars = within(unitsRow!).getAllByRole('listitem').map((item) => item.querySelector('span > span'))
    expect(bars[0]).toHaveStyle({ width: '50%' })
    expect(bars[1]).toHaveStyle({ width: '100%' })
  })
})
