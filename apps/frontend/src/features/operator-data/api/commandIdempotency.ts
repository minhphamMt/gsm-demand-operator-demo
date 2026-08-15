import { AppError } from '@/shared/api/client'

const commandKeys = new Map<string, string>()

function keyFor(command: string, payload: unknown) {
  return `${command}:${JSON.stringify(payload)}`
}

function randomKey() {
  return crypto.randomUUID()
}

function hasUnknownOutcome(error: unknown) {
  return error instanceof AppError
    && (error.status === 503 || error.status === undefined || error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR')
}

// A timeout can still commit in the database. Keep its key until one response
// is known so a deliberate repeat can obtain the durable prior result.
export async function runIdempotentCommand<T>(command: string, payload: unknown, operation: (idempotencyKey: string) => Promise<T>) {
  const key = keyFor(command, payload)
  const idempotencyKey = commandKeys.get(key) ?? randomKey()
  commandKeys.set(key, idempotencyKey)
  try {
    const result = await operation(idempotencyKey)
    commandKeys.delete(key)
    return result
  } catch (error) {
    if (!hasUnknownOutcome(error)) commandKeys.delete(key)
    throw error
  }
}
