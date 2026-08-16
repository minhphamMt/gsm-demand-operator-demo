import { describe, expect, it } from 'vitest'

import { currentOperatorReplaySourceAt, verifiedReplaySources } from './defaultReplay'

describe('default operator replay', () => {
  it('uses only buckets verified to create relocation at every horizon', () => {
    expect(verifiedReplaySources).toContain(currentOperatorReplaySourceAt(new Date('2026-08-15T09:48:00.000Z')) as typeof verifiedReplaySources[number])
  })

  it('advances exactly one curated bucket every five server minutes', () => {
    const now = new Date('2026-08-15T09:45:00.000Z')
    const current = currentOperatorReplaySourceAt(now)
    const next = currentOperatorReplaySourceAt(new Date(now.getTime() + 5 * 60_000))
    const currentIndex = verifiedReplaySources.indexOf(current as typeof verifiedReplaySources[number])
    expect(next).toBe(verifiedReplaySources[(currentIndex + 1) % verifiedReplaySources.length])
  })
})
