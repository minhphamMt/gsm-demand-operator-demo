import { describe, expect, it } from 'vitest'

import { DEFAULT_OPERATOR_REPLAY_SOURCE_AT } from './defaultReplay'

describe('default operator replay', () => {
  it('starts at the selected rainy morning bucket on the five-minute grid', () => {
    const sourceAt = new Date(DEFAULT_OPERATOR_REPLAY_SOURCE_AT)
    expect(sourceAt.getMinutes() % 5).toBe(0)
    expect(new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(sourceAt)).toBe('08')
  })
})
