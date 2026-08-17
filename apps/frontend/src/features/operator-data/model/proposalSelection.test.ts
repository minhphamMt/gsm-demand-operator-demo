import { describe, expect, it } from 'vitest'

import { latestAgentProposalForSnapshot, latestApprovedProposalAwaitingExecution } from '@/features/operator-data/model/proposalSelection'
import type { Campaign, DispatchBatch, Proposal } from '@/features/operator-data/model/types'

const proposal = (inputSnapshotId: string, createdAt: string, id: string) => ({
  id,
  inputSnapshotId,
  createdAt,
  generatorType: 'AGENT',
  rank: 1,
}) as Proposal

describe('latestAgentProposalForSnapshot', () => {
  it('never falls back to a proposal generated from another snapshot', () => {
    expect(latestAgentProposalForSnapshot([
      proposal('snapshot-old', '2026-08-12T08:00:00Z', 'old'),
    ], 'snapshot-current')).toBeUndefined()
  })

  it('selects the newest model result for the exact snapshot', () => {
    const selected = latestAgentProposalForSnapshot([
      proposal('snapshot-current', '2026-08-12T08:00:00Z', 'older'),
      proposal('snapshot-current', '2026-08-12T08:05:00Z', 'newer'),
    ], 'snapshot-current')

    expect(selected?.id).toBe('newer')
  })
})

describe('latestApprovedProposalAwaitingExecution', () => {
  const approved = {
    ...proposal('snapshot-old', '2026-08-12T08:10:00Z', 'approved'),
    status: 'Approved' as const,
    inputFreshUntil: '2026-08-12T08:30:00Z',
  }
  const now = new Date('2026-08-12T08:20:00Z')

  it('restores an approved proposal after navigation even when replay moved to a newer snapshot', () => {
    expect(latestApprovedProposalAwaitingExecution(
      [approved, proposal('snapshot-current', '2026-08-12T08:15:00Z', 'generated')],
      [],
      [],
      now,
    )?.id).toBe('approved')
  })

  it('does not expose an approved proposal that already has an execution record', () => {
    expect(latestApprovedProposalAwaitingExecution(
      [approved],
      [{ planId: approved.id } as Campaign],
      [],
      now,
    )).toBeUndefined()

    expect(latestApprovedProposalAwaitingExecution(
      [approved],
      [],
      [{ proposalId: approved.id } as DispatchBatch],
      now,
    )).toBeUndefined()
  })

  it('stops exposing an approved proposal as soon as its execution window expires', () => {
    expect(latestApprovedProposalAwaitingExecution(
      [approved],
      [],
      [],
      new Date('2026-08-12T08:30:01Z'),
    )).toBeUndefined()
    expect(latestAgentProposalForSnapshot(
      [approved],
      approved.inputSnapshotId,
      new Date('2026-08-12T08:30:01Z'),
    )).toBeUndefined()
  })
})
