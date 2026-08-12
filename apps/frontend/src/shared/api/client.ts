import { getSupabaseClient } from '@/shared/api/supabase'
import { env } from '@/shared/config/env'

export class AppError extends Error {
  readonly code: string
  readonly details: unknown
  readonly requestId: string | undefined
  readonly status: number | undefined
  readonly originalCause: unknown

  constructor(message: string, options: { cause?: unknown; code?: string; details?: unknown; requestId?: string; status?: number } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? 'UNKNOWN_ERROR'
    this.details = options.details
    this.requestId = options.requestId
    this.status = options.status
    this.originalCause = options.cause
  }
}

type ApiErrorBody = { code?: unknown; details?: unknown; message?: unknown; requestId?: unknown }
export type FieldErrors = Readonly<Record<string, string>>
export const sessionExpiredEvent = 'gsm:session-expired'
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function getFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof AppError) || !isRecord(error.details) || !isRecord(error.details.fieldErrors)) return {}
  return Object.fromEntries(
    Object.entries(error.details.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

const statusMessage: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  409: 'Dữ liệu đã thay đổi hoặc thao tác đã được thực hiện trước đó.',
  422: 'Trạng thái dữ liệu hiện tại không cho phép thao tác này.',
}

async function accessToken() {
  if (!env.isLiveData) return null
  const { data, error } = await getSupabaseClient().auth.getSession()
  if (error) throw new AppError('Không thể đọc phiên đăng nhập.', { cause: error, code: 'AUTH_SESSION_ERROR' })
  return data.session?.access_token ?? null
}

export async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const token = await accessToken()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
    if (response.status === 204) return undefined
    let body: unknown
    try {
      body = await response.json()
    } catch (cause) {
      throw new AppError('Máy chủ trả về dữ liệu không hợp lệ.', { cause, code: 'INVALID_JSON', status: response.status })
    }
    if (!response.ok) {
      const errorBody: ApiErrorBody = typeof body === 'object' && body !== null ? body : {}
      const backendMessage = typeof errorBody.message === 'string' ? errorBody.message : undefined
      if (response.status === 401) window.dispatchEvent(new Event(sessionExpiredEvent))
      throw new AppError(statusMessage[response.status] ?? backendMessage ?? 'Máy chủ không thể xử lý yêu cầu.', {
        code: typeof errorBody.code === 'string' ? errorBody.code : 'API_ERROR',
        details: errorBody.details,
        ...(typeof errorBody.requestId === 'string' ? { requestId: errorBody.requestId } : {}),
        status: response.status,
      })
    }
    return body
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new AppError('Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.', { cause, code: 'TIMEOUT' })
    }
    throw new AppError('Không thể kết nối tới máy chủ.', { cause, code: 'NETWORK_ERROR' })
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function requestLocal<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    throw new AppError('Không thể xử lý yêu cầu. Vui lòng thử lại.', { cause })
  }
}
