import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestJson } from '@/shared/api/client'
import { httpOperatorAdapter } from './httpOperatorAdapter'
import { mockOperatorAdapter } from './mockOperatorAdapter'

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/client')>()
  return { ...actual, requestJson: vi.fn() }
})

const request = vi.mocked(requestJson)

describe('httpOperatorAdapter.optimizeAiDecision', () => {
  beforeEach(() => request.mockReset())

  it('returns the policy stop result without looking for a proposal', async () => {
    request.mockResolvedValue({
      decision: {
        planning_status: 'not_required',
        reason_code: 'NO_POLICY_HOTSPOT',
      },
    })

    await expect(httpOperatorAdapter.optimizeAiDecision(461, 15)).resolves.toEqual({
      planningStatus: 'not_required',
      reasonCode: 'NO_POLICY_HOTSPOT',
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/operator/ai/optimize', expect.any(Object))
  })

  it('turns an exact-snapshot failed generation into a no-solution result', async () => {
    request
      .mockResolvedValueOnce({
        decision: {
          planning_status: 'optimizer_evaluated',
          plan: { warnings: [{ code: 'NO_SOLUTION' }] },
        },
      })
      .mockResolvedValueOnce([{
        id: 'failed-proposal',
        status: 'FailedGeneration',
        title: 'No solution',
        targetZoneId: null,
        confidence: null,
        simulationAvailable: false,
        moves: [],
        policyChecks: [],
        generatorType: 'AGENT',
        inputSnapshotId: '461',
        createdAt: '2026-08-17T08:00:00.000Z',
        rank: 1,
        inputFreshUntil: '2026-08-17T08:15:00.000Z',
      }])

    await expect(httpOperatorAdapter.optimizeAiDecision(461, 15)).resolves.toEqual({
      planningStatus: 'not_required',
      reasonCode: 'NO_SOLUTION',
    })
  })
})

describe('httpOperatorAdapter.generateAiDecision', () => {
  beforeEach(() => request.mockReset())

  it('loads the refreshed snapshot returned by the forecast endpoint', async () => {
    const snapshot = await mockOperatorAdapter.getSnapshot('baseline')
    request
      .mockResolvedValueOnce({ snapshot: { id: 912 } })
      .mockResolvedValueOnce({ ...snapshot, replayStep: '912' })

    await expect(httpOperatorAdapter.generateAiDecision(461, 15))
      .resolves.toEqual(expect.objectContaining({ replayStep: '912' }))

    expect(request).toHaveBeenNthCalledWith(2, '/operator/snapshots/912?scenario=baseline')
  })
})
