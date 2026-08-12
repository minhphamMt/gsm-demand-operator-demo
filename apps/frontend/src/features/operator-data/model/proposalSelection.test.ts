import { describe, expect, it } from 'vitest'

import { latestAgentProposalForSnapshot } from '@/features/operator-data/model/proposalSelection'
import type { Proposal } from '@/features/operator-data/model/types'

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
