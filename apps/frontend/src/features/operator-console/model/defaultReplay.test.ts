import { describe, expect, it } from 'vitest'

import { currentOperatorReplaySourceAt } from './defaultReplay'

describe('default operator replay', () => {
  it('uses a verified rain/peak window and keeps the live five-minute cadence', () => {
    expect(currentOperatorReplaySourceAt(new Date('2026-08-15T09:48:00.000Z')))
      .toBe('2026-09-25T08:45:00+07:00')
  })

  it('does not drift into a non-operational hour at midnight', () => {
    expect(currentOperatorReplaySourceAt(new Date('2026-08-14T17:02:00.000Z')))
      .toBe('2026-09-25T08:00:00+07:00')
  })
})
