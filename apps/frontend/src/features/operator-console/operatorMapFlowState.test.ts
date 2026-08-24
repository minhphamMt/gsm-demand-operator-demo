import { describe, expect, it } from 'vitest'

import { operatorMapFlowState } from '@/features/operator-console/operatorMapFlowState'

describe('operatorMapFlowState', () => {
  it('shows moving vehicles while an approved proposal has an active dispatch', () => {
    expect(operatorMapFlowState('executing', 'approved')).toBe('executing')
  })

  it('shows the completed map state for terminal dispatches and campaigns', () => {
    expect(operatorMapFlowState('executed', 'approved')).toBe('completed')
    expect(operatorMapFlowState('approved', 'campaign')).toBe('completed')
  })

  it('keeps non-executing proposals in proposal mode', () => {
    expect(operatorMapFlowState('approved', 'approved')).toBe('proposal')
  })
})
