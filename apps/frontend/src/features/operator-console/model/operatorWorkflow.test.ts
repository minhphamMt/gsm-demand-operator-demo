import { describe, expect, it } from 'vitest'

import { planningHorizonFor, resolveWorkflowStage } from '@/features/operator-console/model/operatorWorkflow'

describe('planningHorizonFor', () => {
  it('keeps replay stepping at five minutes separate from the selected planning horizon', () => {
    expect(planningHorizonFor(5, 30)).toBe(30)
    expect(planningHorizonFor(5, 15)).toBe(15)
  })

  it('preserves an explicit operational forecast horizon', () => {
    expect(planningHorizonFor(15, 30)).toBe(15)
    expect(planningHorizonFor(30, 15)).toBe(30)
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

  it.each(['Rejected', 'Stale', 'FailedGeneration'])(
    'does not expose moves or approval actions for a %s plan',
    (status) => expect(resolveWorkflowStage('plan', false, status)).toBe('observe'),
  )
})
