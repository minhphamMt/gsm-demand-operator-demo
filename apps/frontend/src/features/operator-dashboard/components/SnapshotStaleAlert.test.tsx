import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SnapshotStaleAlert } from '@/features/operator-dashboard/components/SnapshotStaleAlert'

describe('SnapshotStaleAlert', () => {
  const now = new Date('2026-08-09T12:10:00.000Z')

  it('warns and safely retries when the DB snapshot is stale', () => {
    const refresh = vi.fn()
    render(<SnapshotStaleAlert generatedAt="2026-08-09T12:00:00.000Z" isRefreshing={false} now={now} onRefresh={refresh} />)
    expect(screen.getByRole('alert')).toHaveTextContent('cách hiện tại 10 phút')
    fireEvent.click(screen.getByRole('button', { name: /Tải snapshot mới/ }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('stays hidden while the snapshot is fresh', () => {
    const { container } = render(<SnapshotStaleAlert generatedAt="2026-08-09T12:08:00.000Z" isRefreshing={false} now={now} onRefresh={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains that stale data will be retried automatically', () => {
    render(<SnapshotStaleAlert autoRefresh generatedAt="2026-08-09T12:00:00.000Z" isRefreshing={false} now={now} onRefresh={vi.fn()} />)

    expect(screen.getByText('Snapshot đang được tự động làm mới')).toBeInTheDocument()
    expect(screen.getByText(/tự thử lại sau 15 giây/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Làm mới ngay' })).toBeInTheDocument()
  })
})
