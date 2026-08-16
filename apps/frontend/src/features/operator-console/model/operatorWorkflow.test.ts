import { describe, expect, it } from 'vitest'

import { planningHorizonFor, resolveWorkflowStage } from '@/features/operator-console/model/operatorWorkflow'

describe('planningHorizonFor', () => {
  it('optimizes against the exact forecast visible to the operator', () => {
    expect(planningHorizonFor(5)).toBe(5)
    expect(planningHorizonFor(15)).toBe(15)
    expect(planningHorizonFor(30)).toBe(30)
  })
})

describe('resolveWorkflowStage', () => {
  it('removes campaign execution state as soon as the linked campaign is terminal', () => {
    expect(resolveWorkflowStage('campaign', false)).toBe('observe')
  })

  it('drops plan actions when the proposal is terminal history', () => {
    expect(resolveWorkflowStage('approved', false)).toBe('observe')
    expect(resolveWorkflowStage('plan', false)).toBe('observe')
  })

  it('keeps campaign state only while the server reports it operational', () => {
    expect(resolveWorkflowStage('observe', true)).toBe('campaign')
  })

  it('keeps the no-solution result visible when generation completed without a safe action', () => {
    expect(resolveWorkflowStage('no_solution', false, 'FailedGeneration')).toBe('no_solution')
  })

  it.each(['Rejected', 'Stale', 'FailedGeneration'])(
    'does not expose moves or approval actions for a %s plan',
    (status) => expect(resolveWorkflowStage('plan', false, status)).toBe('observe'),
  )
})
