import { describe, expect, it } from 'vitest'

import { getSnapshotFreshness, snapshotPollInterval } from '@/features/operator-data/model/snapshotFreshness'

describe('snapshot freshness policy', () => {
  const now = new Date('2026-08-09T12:10:00.000Z')

  it('marks a snapshot stale after two missed five-minute refresh cycles', () => {
    expect(getSnapshotFreshness('2026-08-09T12:00:00.000Z', now)).toEqual({ ageMinutes: 10, isStale: false })
    expect(getSnapshotFreshness('2026-08-09T11:59:59.000Z', now)).toEqual({ ageMinutes: 10, isStale: true })
    expect(getSnapshotFreshness('invalid', now)).toEqual({ ageMinutes: null, isStale: true })
  })

  it('polls every five minutes only while the page is visible', () => {
    expect(snapshotPollInterval('visible')).toBe(300_000)
    expect(snapshotPollInterval('hidden')).toBe(false)
  })
})
