import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/env', () => ({
  env: { apiBaseUrl: 'http://api.test/api/v1', isLiveData: true },
}))

const signOut = vi.fn(async () => undefined)
const getSession = vi.fn(async () => ({ data: { session: { access_token: 'test-token' } }, error: null }))
const unsubscribe = vi.fn()
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }),
      signInWithPassword: vi.fn(),
      signOut,
    },
  }),
}))

import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/useAuth'
import { sessionExpiredEvent } from '@/shared/api/client'

function AuthStatus() {
  return <p>{useAuth().status}</p>
}

describe('AuthProvider session expiry', () => {
  it('clears authenticated state when the API announces a 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'operator-1', email: 'operator@test.local', role: 'OPERATOR' }), { status: 200 })))
    const queryClient = new QueryClient()
    render(<QueryClientProvider client={queryClient}><AuthProvider><AuthStatus /></AuthProvider></QueryClientProvider>)
    expect(await screen.findByText('authenticated')).toBeInTheDocument()

    window.dispatchEvent(new Event(sessionExpiredEvent))

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument())
    expect(signOut).toHaveBeenCalled()
  })
})
