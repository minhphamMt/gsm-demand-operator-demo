import { beforeEach, describe, expect, it } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import type { Proposal } from '@/features/operator-data'
import { createRevisionRequest, initialMoveQuantities, moveQuantityLimit, previewPlanRevision } from './planRevision'

describe('plan revision preview', () => {
  let plan: Proposal

  beforeEach(async () => {
    await mockOperatorAdapter.resetDemo()
    const loaded = await mockOperatorAdapter.getPlan('PLN-042')
    if (!loaded) throw new Error('Missing proposal fixture')
    plan = loaded
  })

  it('updates coverage and residual gap from edited vehicle quantities', () => {
    const quantities = { ...initialMoveQuantities(plan), [plan.moves[0]!.id]: 0 }
    const preview = previewPlanRevision(plan, quantities)
    expect(preview.assigned).toBe(plan.moves.reduce((sum, move, index) => sum + (index === 0 ? 0 : move.quantity), 0))
    expect(preview.residualGap).toBeGreaterThan(plan.metrics.residualGap)
    expect(preview.hasChanges).toBe(true)
  })

  it('caps a source at its declared safe capacity and creates an audited request', () => {
    const quantities = initialMoveQuantities(plan)
    const firstMove = plan.moves[0]!
    expect(moveQuantityLimit(plan, quantities, firstMove.id)).toBeGreaterThanOrEqual(firstMove.quantity)
    expect(createRevisionRequest(plan, { ...quantities, [firstMove.id]: firstMove.quantity - 1 }).note).toContain('Điều chỉnh số xe')
  })
})
