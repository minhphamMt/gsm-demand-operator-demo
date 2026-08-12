import { describe, expect, it } from 'vitest'

import { formatCurrency, formatOptionalPercentRatio, formatPercentRatio, formatTime } from '@/shared/lib/format'

describe('Vietnamese formatters', () => {
  it('formats VND without fractional units', () => {
    expect(formatCurrency(250_000)).toContain('250.000')
    expect(formatCurrency(250_000)).toContain('₫')
  })

  it('formats ratios and unavailable confidence explicitly', () => {
    expect(formatPercentRatio(0.915, 1)).toBe('91,5%')
    expect(formatOptionalPercentRatio(null)).toBe('Chưa có')
  })

  it('always displays operational timestamps in Vietnam time', () => {
    expect(formatTime('2026-08-05T02:30:00.000Z')).toBe('09:30 05/08/2026')
  })
})
