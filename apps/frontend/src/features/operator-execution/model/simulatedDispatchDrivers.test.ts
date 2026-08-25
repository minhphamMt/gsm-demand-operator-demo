import { describe, expect, it } from 'vitest'

import { simulatedDispatchDrivers, simulatedDriverMovementLabel } from './simulatedDispatchDrivers'

const move = {
  acknowledgedUnits: 3,
  arrivedUnits: 0,
  availableUnits: 0,
  distanceKm: 5.1,
  etaMinutes: 15,
  failedUnits: 0,
  id: 'move-1',
  plannedUnits: 3,
  sourceMoveKey: 'MV-01',
  sourceZoneId: 14,
  state: 'ACKNOWLEDGED' as const,
  targetZoneId: 9,
}

describe('simulatedDispatchDrivers', () => {
  it('creates stable and varied mock drivers without battery information', () => {
    const first = simulatedDispatchDrivers('batch-1', move)
    const refreshed = simulatedDispatchDrivers('batch-1', move)

    expect(first).toEqual(refreshed)
    expect(first).toHaveLength(3)
    expect(new Set(first.map((driver) => driver.id)).size).toBe(3)
    expect(new Set(first.map((driver) => driver.profile)).size).toBeGreaterThan(1)
    expect(first.every((driver) => driver.state === 'ACCEPTED')).toBe(true)
    expect(first.every((driver) => !('batteryPercent' in driver))).toBe(true)
  })

  it('reflects accepted, declined, and en-route unit progress', () => {
    const responseDrivers = simulatedDispatchDrivers('batch-1', {
      ...move,
      acknowledgedUnits: 1,
      failedUnits: 1,
      state: 'SENT',
    })
    expect(responseDrivers.map((driver) => driver.state)).toEqual(['ACCEPTED', 'DECLINED', 'PENDING'])

    const movingDrivers = simulatedDispatchDrivers('batch-1', { ...move, state: 'EN_ROUTE' })
    expect(movingDrivers.every((driver) => driver.state === 'EN_ROUTE')).toBe(true)
    expect(movingDrivers.every((driver) => driver.progressPercent >= 38 && driver.progressPercent <= 82)).toBe(true)
    expect(simulatedDriverMovementLabel(movingDrivers[0]!, move, 'Đống Đa', 'Ba Đình'))
      .toMatch(/^Đang đến Ba Đình · Còn \d\.\d km$/)
  })
})
