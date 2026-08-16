import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/env', () => ({
  env: { apiBaseUrl: 'http://api.test/api/v1', isLiveData: true },
}))

const getSession = vi.fn(async () => ({ data: { session: { access_token: 'test-token' } }, error: null }))
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
}))

import { getFieldErrors, requestJson, sessionExpiredEvent } from '@/shared/api/client'

describe('requestJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('injects the bearer token and parses JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(requestJson('/health')).resolves.toEqual({ ok: true })
    const request = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(request?.[1]?.headers)
    expect(request?.[0]).toBe('http://api.test/api/v1/health')
    expect(request?.[1]?.cache).toBe('no-store')
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('rejects invalid JSON without exposing the response body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 200 }))
    await expect(requestJson('/broken')).rejects.toMatchObject({ code: 'INVALID_JSON' })
  })

  it('normalizes authorization errors', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'raw backend detail' }), { status: 403 }))
    await expect(requestJson('/private')).rejects.toEqual(expect.objectContaining({
      code: 'API_ERROR',
      message: 'Bạn không có quyền thực hiện thao tác này.',
      status: 403,
    }))
  })

  it.each([
    [404, 'Không tìm thấy dữ liệu được yêu cầu.'],
    [409, 'Dữ liệu đã thay đổi hoặc thao tác đã được thực hiện trước đó.'],
    [429, 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.'],
    [503, 'Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.'],
  ])('normalizes HTTP %s errors for browser UI', async (status, message) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: 'TEST_ERROR' }), { status }))
    await expect(requestJson('/operator/test')).rejects.toEqual(expect.objectContaining({ message, status }))
  })

  it('announces an expired session after a 401 response', async () => {
    const expired = vi.fn()
    window.addEventListener(sessionExpiredEvent, expired, { once: true })
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }))

    await expect(requestJson('/operator/private')).rejects.toMatchObject({ status: 401 })
    expect(expired).toHaveBeenCalledOnce()
  })

  it('normalizes an unavailable API as a retryable network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('connection refused'))
    await expect(requestJson('/operator/down')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('preserves safe error details and request id for operator forms', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: { budgetLimit: 'budgetLimit must not be less than 0' },
        issues: ['budgetLimit must not be less than 0'],
      },
      message: 'Dữ liệu gửi lên không hợp lệ.',
      requestId: 'request-test-1',
    }), { status: 422 }))

    const request = requestJson('/operator/proposals/test/revisions')
    await expect(request).rejects.toEqual(expect.objectContaining({
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: { budgetLimit: 'budgetLimit must not be less than 0' },
        issues: ['budgetLimit must not be less than 0'],
      },
      requestId: 'request-test-1',
      status: 422,
    }))
    await request.catch((error: unknown) => {
      expect(getFieldErrors(error)).toEqual({ budgetLimit: 'budgetLimit must not be less than 0' })
    })
  })

  it('aborts requests after the timeout', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = requestJson('/slow')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(12_000)
    await assertion
  })
})
