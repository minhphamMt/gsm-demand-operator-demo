import { describe, expect, it } from 'vitest'

import { runIdempotentCommand } from '@/features/operator-data/api/commandIdempotency'
import { AppError } from '@/shared/api/client'

describe('runIdempotentCommand', () => {
  it('keeps the key after an unknown outcome and clears it after success', async () => {
    const keys: string[] = []
    await expect(runIdempotentCommand('proposal-approve', { id: 'proposal-1', version: 1 }, async (key) => {
      keys.push(key)
      throw new AppError('Unknown outcome', { code: 'TIMEOUT' })
    })).rejects.toMatchObject({ code: 'TIMEOUT' })

    await runIdempotentCommand('proposal-approve', { id: 'proposal-1', version: 1 }, async (key) => {
      keys.push(key)
      return 'approved'
    })
    await runIdempotentCommand('proposal-approve', { id: 'proposal-1', version: 1 }, async (key) => {
      keys.push(key)
      return 'approved-again'
    })

    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[1])
  })

  it('does not reuse a key after a known conflict', async () => {
    const keys: string[] = []
    await expect(runIdempotentCommand('proposal-reject', { id: 'proposal-1', version: 1 }, async (key) => {
      keys.push(key)
      throw new AppError('Conflict', { code: 'PROPOSAL_VERSION_CONFLICT', status: 409 })
    })).rejects.toMatchObject({ status: 409 })

    await runIdempotentCommand('proposal-reject', { id: 'proposal-1', version: 1 }, async (key) => {
      keys.push(key)
      return 'rejected'
    })

    expect(keys[1]).not.toBe(keys[0])
  })
})
