import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/env', () => ({
  env: { apiBaseUrl: 'http://api.test/api/v1', autoLogin: true, isLiveData: true },
}))

const signOut = vi.fn(async () => undefined)
type TestSession = { access_token: string; user: { id: string } }
type SessionResponse = { data: { session: TestSession | null }; error: null }
const testSession: TestSession = { access_token: 'test-token', user: { id: 'operator-1' } }
const getSession = vi.fn<() => Promise<SessionResponse>>(async () => ({ data: { session: testSession }, error: null }))
const setSession = vi.fn(async () => ({ data: { session: testSession }, error: null }))
const unsubscribe = vi.fn()
type AuthStateCallback = (event: string, session: TestSession | null) => void
let authStateCallback: AuthStateCallback | undefined
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      setSession,
      onAuthStateChange: (callback: AuthStateCallback) => {
        authStateCallback = callback
        return { data: { subscription: { unsubscribe } } }
      },
      signInWithPassword: vi.fn(),
      signOut,
    },
  }),
}))

import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/useAuth'
import { sessionExpiredEvent } from '@/shared/api/client'

function AuthStatus() {
  const auth = useAuth()
  return <><p>{auth.status}</p><p>{auth.identity?.id ?? 'none'}</p></>
}

describe('AuthProvider session expiry', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockResolvedValue({ data: { session: testSession }, error: null })
    setSession.mockResolvedValue({ data: { session: testSession }, error: null })
    window.sessionStorage.clear()
  })

  it('bootstraps the session only once under React StrictMode', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient()

    render(<StrictMode><QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider></StrictMode>)

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(getSession).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('creates a demo operator session when auto-login is enabled and no session exists', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'demo-access', refresh_token: 'demo-refresh' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient()

    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(setSession).toHaveBeenCalledWith({ access_token: 'demo-access', refresh_token: 'demo-refresh' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears authenticated state when the API announces a 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 })))
    const queryClient = new QueryClient()
    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)
    expect(await screen.findByText('authenticated')).toBeInTheDocument()

    window.dispatchEvent(new Event(sessionExpiredEvent))

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())
    expect(signOut).toHaveBeenCalled()
  })

  it('does not duplicate identity resolution triggered by an auth-state callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 })))
    const queryClient = new QueryClient()
    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)
    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    const callsBeforeEvent = getSession.mock.calls.length

    authStateCallback?.('SIGNED_IN', testSession)

    expect(getSession).toHaveBeenCalledTimes(callsBeforeEvent)
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(callsBeforeEvent))
  })

  it('keeps a verified session identity when the identity API is temporarily unavailable', async () => {
    window.sessionStorage.setItem('gsm:auth-identity:v1', JSON.stringify({
      id: 'operator-1',
      email: 'operator@test.local',
      role: 'OPERATOR',
    }))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connection refused') }))
    const queryClient = new QueryClient()

    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('fails closed when the identity API rejects the cached role', async () => {
    window.sessionStorage.setItem('gsm:auth-identity:v1', JSON.stringify({
      id: 'operator-1',
      email: 'operator@test.local',
      role: 'OPERATOR',
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 })))
    const queryClient = new QueryClient()

    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('gsm:auth-identity:v1')).toBeNull()
  })

  it('clears all query cache before accepting a different authenticated identity', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'driver-1', email: 'driver@test.local', role: 'DRIVER' }), { status: 200 })))
    const queryClient = new QueryClient()
    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)
    expect(await screen.findByText('operator-1')).toBeInTheDocument()
    queryClient.setQueryData(['operator', 'snapshot'], { source: 'operator-1' })

    authStateCallback?.('TOKEN_REFRESHED', { access_token: 'driver-token', user: { id: 'driver-1' } })

    expect(await screen.findByText('driver-1')).toBeInTheDocument()
    expect(queryClient.getQueryData(['operator', 'snapshot'])).toBeUndefined()
  })
})
