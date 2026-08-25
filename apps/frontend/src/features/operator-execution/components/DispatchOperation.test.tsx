import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { DispatchBatch } from '@/features/operator-data'

import { DispatchOperation } from './DispatchOperation'

describe('DispatchOperation simulation presentation', () => {
  it('shows the complete lifecycle and stable mock-driver details', () => {
    const batch: DispatchBatch = {
      approvedContentHash: 'hash-1',
      id: 'batch-1',
      moves: [{
        acknowledgedUnits: 2,
        arrivedUnits: 0,
        availableUnits: 0,
        distanceKm: 5.1,
        etaMinutes: 15,
        failedUnits: 0,
        id: 'move-1',
        plannedUnits: 2,
        sourceMoveKey: 'MV-01',
        sourceZoneId: 14,
        state: 'ACKNOWLEDGED',
        targetZoneId: 9,
      }],
      proposalId: 'proposal-1',
      proposalVersion: 1,
      reconciliations: [],
      releasedAt: '2026-08-25T00:00:00.000Z',
      status: 'PARTIALLY_ACKED',
    }

    render(<MemoryRouter><DispatchOperation
      batch={batch}
      isRefreshing={false}
      isRetrying={false}
      onRefresh={vi.fn()}
      onRetry={vi.fn()}
      onStop={vi.fn()}
      plan={undefined}
    /></MemoryRouter>)

    const lifecycle = screen.getByLabelText('Vòng đời trạng thái mô phỏng')
    expect(within(lifecycle).getByText('Đã tiếp nhận')).toHaveClass('is-current')
    expect(within(lifecycle).getByText('Đã gửi')).toHaveClass('is-done')
    expect(within(lifecycle).getByText('Sẵn sàng phục vụ')).not.toHaveClass('is-done')
    expect(screen.getByText('TÀI XẾ MÔ PHỎNG')).toBeInTheDocument()
    expect(screen.getAllByText('Đã nhận chuyến')).toHaveLength(2)
    expect(screen.queryByText(/pin \d+%/i)).not.toBeInTheDocument()
    expect(screen.getByText(/mô phỏng tối thiểu 12 phút/)).toBeInTheDocument()
  })
})
