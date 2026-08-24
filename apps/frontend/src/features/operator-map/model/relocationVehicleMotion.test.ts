import { describe, expect, it } from 'vitest'

import { routeMotionAt } from './relocationVehicleMotion'

describe('routeMotionAt', () => {
  it('moves the car continuously through every segment of the displayed route', () => {
    const route = [[105, 21], [106, 21], [106, 22]] as const

    expect(routeMotionAt(route, 0.25)?.coordinate).toEqual([105.5, 21])
    expect(routeMotionAt(route, 0.75)?.coordinate).toEqual([106, 21.5])
  })

  it('rotates the top-facing car toward the destination and loops at the route end', () => {
    expect(routeMotionAt([[105, 21], [106, 21]], 0.5)?.bearing).toBeCloseTo(90)
    expect(routeMotionAt([[105, 21], [105, 22]], 0.5)?.bearing).toBeCloseTo(0)
    expect(routeMotionAt([[105, 21], [106, 21]], 1)?.coordinate).toEqual([105, 21])
  })

  it('handles an unavailable or stationary route safely', () => {
    expect(routeMotionAt([], 0.5)).toBeNull()
    expect(routeMotionAt([[105, 21]], 0.5)).toEqual({ bearing: 0, coordinate: [105, 21] })
  })
})
