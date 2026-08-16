import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestJson } from '@/shared/api/client'
import { httpOperatorAdapter } from './httpOperatorAdapter'

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
})
