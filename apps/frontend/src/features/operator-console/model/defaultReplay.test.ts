import { describe, expect, it } from 'vitest'

import { currentOperatorReplaySourceAt } from './defaultReplay'

describe('default operator replay', () => {
  it('uses the current Hanoi time rounded down to the latest five-minute bucket', () => {
    expect(currentOperatorReplaySourceAt(new Date('2026-08-15T09:48:00.000Z')))
      .toBe('2026-09-30T16:45:00+07:00')
  })

  it('keeps midnight buckets inside the frozen replay dataset day', () => {
    expect(currentOperatorReplaySourceAt(new Date('2026-08-14T17:02:00.000Z')))
      .toBe('2026-09-30T00:00:00+07:00')
  })
})
