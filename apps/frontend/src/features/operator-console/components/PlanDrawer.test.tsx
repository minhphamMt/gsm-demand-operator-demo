import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import type { Proposal, RevisePlanRequest } from '@/features/operator-data'
import { PlanDrawer } from './PlanDrawer'

describe('PlanDrawer', () => {
  let plan: Proposal

  beforeEach(async () => {
    await mockOperatorAdapter.resetDemo()
    const loaded = await mockOperatorAdapter.getPlan('PLN-042')
    if (!loaded) throw new Error('Missing proposal fixture')
    plan = loaded
  })

  it('previews a vehicle change and saves it as a revised plan', async () => {
    const user = userEvent.setup()
    const onRevise = vi.fn<(request: RevisePlanRequest) => void>()
    const firstMove = plan.moves[0]!

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={onRevise} plan={plan} />)

    await user.click(screen.getByRole('button', { name: `Giảm xe ${firstMove.sourceZoneLabel} đến ${firstMove.targetZoneLabel}` }))

    expect(screen.getByRole('status', { name: `Số xe ${firstMove.sourceZoneLabel} đến ${firstMove.targetZoneLabel}` })).toHaveTextContent(String(firstMove.quantity - 1))
    expect(screen.getByRole('button', { name: 'Lưu điều chỉnh' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }))

    expect(onRevise).toHaveBeenCalledOnce()
    expect(onRevise.mock.calls[0]![0].moveQuantities[firstMove.id]).toBe(firstMove.quantity - 1)
  })

  it('shows immutable forecast and model-input provenance before review', () => {
    plan = { ...plan, planMode: 'ACTIVATION_ONLY', forecastRunId: 'run-immutable-1', modelInputId: 'input-immutable-1' }

    render(<PlanDrawer error={null} isSaving={false} onClose={vi.fn()} onRevise={vi.fn()} plan={plan} />)

    expect(screen.getByText('run-immutable-1')).toBeInTheDocument()
    expect(screen.getByText('input-immutable-1')).toBeInTheDocument()
    expect(screen.getByText(plan.inputSnapshotId)).toBeInTheDocument()
    expect(screen.getByText(/Chế độ: chỉ activation/)).toBeInTheDocument()
  })
})
