import { describe, expect, it } from 'vitest'

import type { DispatchMove } from '@/features/operator-data/model/types'
import { dispatchProgress, dispatchStatusPresentation } from '@/features/operator-data/model/dispatchPresentation'

const move = (state: DispatchMove['state'], plannedUnits = 2): DispatchMove => ({
  id: state,
  sourceMoveKey: state,
  sourceZoneId: 1,
  targetZoneId: 2,
  plannedUnits,
  acknowledgedUnits: 0,
  arrivedUnits: 0,
  availableUnits: state === 'AVAILABLE' ? plannedUnits : 0,
  failedUnits: state === 'FAILED' ? plannedUnits : 0,
  state,
  etaMinutes: 5,
  distanceKm: 1,
})

const batch = (status: string, moves: DispatchMove[], releasedAt = '2026-08-15T10:00:00.000Z') => ({ status, moves, releasedAt })

describe('dispatch presentation', () => {
  it('does not animate a queued command that has not been accepted', () => {
    expect(dispatchStatusPresentation(batch('QUEUED', [move('PLANNED')]), Date.parse('2026-08-15T10:01:00.000Z'))).toMatchObject({ isAnimating: false, isQueued: true, label: 'Chờ hệ thống tiếp nhận' })
  })

  it('stops the live animation and asks for review after ETA', () => {
    expect(dispatchStatusPresentation(batch('IN_PROGRESS', [move('EN_ROUTE')]), Date.parse('2026-08-15T10:20:00.000Z'))).toMatchObject({ isAnimating: false, isOverdue: true, label: 'Cần kiểm tra' })
  })

  it('flags a queued command that was never accepted', () => {
    expect(dispatchStatusPresentation(batch('QUEUED', [move('PLANNED')]), Date.parse('2026-08-15T10:20:00.000Z'))).toMatchObject({ isQueued: false, isOverdue: true, label: 'Cần kiểm tra' })
  })

  it('counts only terminal moves as completed', () => {
    expect(dispatchProgress(batch('IN_PROGRESS', [move('AVAILABLE'), move('EN_ROUTE'), move('FAILED')]))).toMatchObject({ totalMoves: 3, finishedMoves: 2, activeMoves: 1, failedMoves: 1, completionPercent: 67 })
  })
})
