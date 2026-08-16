import { describe, expect, it } from 'vitest'

import { observedAtForReplaySource } from './replayClock'

describe('replay display clock', () => {
  it('maps frozen provenance onto the server live edge without changing elapsed time', () => {
    expect(observedAtForReplaySource(
      '2026-09-25T07:00:00+07:00',
      '2026-09-25T08:00:00+07:00',
      '2026-08-16T06:03:42.000Z',
    )).toBe('2026-08-16T05:00:00.000Z')
  })
})
