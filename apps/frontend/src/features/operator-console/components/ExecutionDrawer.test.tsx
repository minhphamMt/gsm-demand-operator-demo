import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createAgentPlans } from '@/features/operator-data/model/mockProposalEngine'
import type { DispatchBatch, DispatchMove, Move } from '@/features/operator-data'
import { ExecutionDrawer } from './ExecutionDrawer'

const zoneNumber = (id: string) => Number(id.replace(/^AI-Z/i, ''))

function execution(move: Move, index: number, state: DispatchMove['state']): DispatchMove {
  return {
    id: `dispatch-${index + 1}`,
    sourceMoveKey: String(index + 1),
    sourceZoneId: zoneNumber(move.sourceZoneId),
    targetZoneId: zoneNumber(move.targetZoneId),
    plannedUnits: move.quantity,
    acknowledgedUnits: state === 'ACKNOWLEDGED' || state === 'EN_ROUTE' || state === 'ARRIVED' || state === 'AVAILABLE' ? move.quantity : 0,
    arrivedUnits: state === 'ARRIVED' || state === 'AVAILABLE' ? move.quantity : 0,
    availableUnits: state === 'AVAILABLE' ? move.quantity : 0,
    failedUnits: 0,
    state,
    etaMinutes: move.etaMinutes,
    distanceKm: move.distanceKm,
  }
}

describe('ExecutionDrawer', () => {
  const source = createAgentPlans('rain-peak')[0]!
  const first = source.moves[0]!
  const second: Move = { ...first, id: `${first.id}-2`, sourceZoneId: 'AI-Z04', sourceZoneLabel: 'Đống Đa' }
  const plan = { ...source, moves: [first, second] }

  it('shows queued database states and never invents SENT or EN_ROUTE', () => {
    const batch: DispatchBatch = {
      id: 'batch-1', proposalId: plan.id, proposalVersion: plan.version,
      approvedContentHash: 'hash', status: 'QUEUED', releasedAt: new Date().toISOString(),
      moves: [execution(first, 0, 'PLANNED'), execution(second, 1, 'PLANNED')], reconciliations: [],
    }

    render(<ExecutionDrawer batch={batch} isComplete={false} onClose={vi.fn()} plan={plan} />)

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getAllByText('Chờ gửi')).toHaveLength(2)
    expect(screen.queryByText('Đang di chuyển')).not.toBeInTheDocument()
    expect(screen.queryByText('Đã gửi')).not.toBeInTheDocument()
    expect(screen.getByText('Chờ xe AVAILABLE và snapshot fresh')).toBeInTheDocument()
  })

  it('computes completion from terminal dispatch moves and reveals verified reconciliation only at completion', () => {
    const batch: DispatchBatch = {
      id: 'batch-2', proposalId: plan.id, proposalVersion: plan.version,
      approvedContentHash: 'hash', status: 'EXECUTED', releasedAt: new Date().toISOString(),
      moves: [execution(first, 0, 'AVAILABLE'), execution(second, 1, 'AVAILABLE')],
      reconciliations: [{
        id: 'rec-1', revision: 10, plannedUnits: 4, acknowledgedUnits: 4, arrivedUnits: 4,
        availableUnits: 4, failedUnits: 0, actualContribution: 4, residualGap: 7.5,
        isSnapshotFresh: true, createdAt: new Date().toISOString(),
      }],
    }

    render(<ExecutionDrawer batch={batch} isComplete onClose={vi.fn()} plan={plan} />)

    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getAllByText('Sẵn sàng phục vụ')).toHaveLength(2)
    expect(screen.getByText('7,5 xe')).toBeInTheDocument()
  })
})
