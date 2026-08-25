import { describe, expect, it } from 'vitest'

import { simulatedDispatchDrivers } from './simulatedDispatchDrivers'

describe('simulatedDispatchDrivers', () => {
  it('creates stable and varied mock drivers for every planned unit', () => {
    const move = { id: 'move-1', plannedUnits: 3 }
    const first = simulatedDispatchDrivers('batch-1', move)
    const refreshed = simulatedDispatchDrivers('batch-1', move)

    expect(first).toEqual(refreshed)
    expect(first).toHaveLength(3)
    expect(new Set(first.map((driver) => driver.id)).size).toBe(3)
    expect(new Set(first.map((driver) => driver.profile)).size).toBeGreaterThan(1)
    expect(first.every((driver) => driver.batteryPercent >= 52 && driver.batteryPercent <= 94)).toBe(true)
  })
})
