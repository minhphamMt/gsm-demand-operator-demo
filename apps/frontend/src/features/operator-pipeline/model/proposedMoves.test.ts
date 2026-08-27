import { describe, expect, it } from 'vitest'

import { moveLabel, readProposedMoves } from '@/features/operator-pipeline/model/proposedMoves'

describe('readProposedMoves', () => {
  it('reads the moves of the decision payload', () => {
    const moves = readProposedMoves({
      plan: { moves: [{ from_zone: 4, to_zone: 12, units_to_move: 5, eta_steps: 2, estimated_cost: 40_000 }] },
    })

    expect(moves).toEqual([{ id: '4-12-0', fromZone: 4, toZone: 12, units: 5, etaSteps: 2, estimatedCost: 40_000 }])
    expect(moveLabel(moves[0]!)).toBe('Điều 5 xe từ zone 4 sang zone 12')
  })

  it('drops malformed entries instead of rendering undefined values', () => {
    const moves = readProposedMoves({ plan: { moves: [{ from_zone: 4 }, 'not-a-move', null] } })

    expect(moves).toEqual([])
  })

  it('returns an empty list when the run has no decision yet', () => {
    expect(readProposedMoves(undefined)).toEqual([])
    expect(readProposedMoves({})).toEqual([])
    expect(readProposedMoves({ plan: {} })).toEqual([])
  })
})
