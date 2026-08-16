import { describe, expect, it } from 'vitest'

import type { Campaign, DispatchBatch, Proposal } from '@/features/operator-data/model/types'
import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import {
  activeExecutionPlan,
  isCampaignExecutionActive,
  isDispatchExecutionActive,
} from '@/features/operator-data/model/activeExecution'

describe('active execution guard', () => {
  it.each(['Draft', 'Scheduled', 'Active', 'Paused', 'Running', 'Settling'] as const)(
    'blocks a new plan while campaign status is %s',
    (status) => expect(isCampaignExecutionActive({ status })).toBe(true),
  )

  it.each(['TargetReached', 'Completed', 'Cancelled', 'BudgetExhausted', 'Expired', 'Settled', 'Closed'] as const)(
    'allows a new plan after campaign status is %s',
    (status) => expect(isCampaignExecutionActive({ status })).toBe(false),
  )

  it('treats only non-terminal dispatch states as active', () => {
    expect(isDispatchExecutionActive({ status: 'IN_PROGRESS' })).toBe(true)
    expect(isDispatchExecutionActive({ status: 'EXECUTED' })).toBe(false)
    expect(isDispatchExecutionActive({ status: 'PARTIALLY_EXECUTED' })).toBe(false)
    expect(isDispatchExecutionActive({ status: 'CANCELLED' })).toBe(false)
  })

  it('keeps tracking an active plan even after the displayed snapshot changes', () => {
    const plan = createAgentPlans('rain-peak')[0]!
    const dispatch = { proposalId: plan.id, status: 'IN_PROGRESS' } as DispatchBatch

    expect(activeExecutionPlan([plan] as Proposal[], [] as Campaign[], [dispatch])).toEqual({
      campaign: undefined,
      dispatch,
      plan,
      planId: plan.id,
    })
  })
})
