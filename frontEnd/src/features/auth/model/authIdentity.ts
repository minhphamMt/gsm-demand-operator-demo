import type { AuthIdentity } from '@/features/auth/model/types'

export function parseAuthIdentity(value: unknown): AuthIdentity {
  if (!isRecord(value)) throw new Error('Invalid authenticated identity')
  const record = value
  if (typeof record.id !== 'string' || (record.email !== null && typeof record.email !== 'string')) {
    throw new Error('Invalid authenticated identity fields')
  }
  if (record.role !== 'OPERATOR' && record.role !== 'DRIVER') throw new Error('Invalid application role')
  return { id: record.id, email: record.email, role: record.role }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
