import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'

import { parseAuthIdentity } from '@/features/auth/model/authIdentity'
import { AuthContext } from '@/features/auth/model/AuthContext'
import type { AuthIdentity, AuthState } from '@/features/auth/model/types'
import { AppError, requestJson, sessionExpiredEvent } from '@/shared/api/client'
import { getSupabaseClient } from '@/shared/api/supabase'
import { env } from '@/shared/config/env'

const identityCacheKey = 'gsm:auth-identity:v1'

function clearCachedIdentity() {
  try { window.sessionStorage.removeItem(identityCacheKey) } catch { /* storage can be unavailable */ }
}

function readCachedIdentity(userId: string | undefined): AuthIdentity | undefined {
  if (!userId) return undefined
  try {
    const identity = parseAuthIdentity(JSON.parse(window.sessionStorage.getItem(identityCacheKey) ?? 'null'))
    return identity.id === userId ? identity : undefined
  } catch {
    clearCachedIdentity()
    return undefined
  }
}

function writeCachedIdentity(identity: AuthIdentity, userId: string | undefined) {
  if (!userId || identity.id !== userId) return
  try { window.sessionStorage.setItem(identityCacheKey, JSON.stringify(identity)) } catch { /* storage can be unavailable */ }
}

function isRetryableIdentityFailure(cause: unknown) {
  return cause instanceof AppError
    && (cause.code === 'NETWORK_ERROR' || cause.code === 'TIMEOUT' || (cause.status !== undefined && cause.status >= 500))
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const requestVersion = useRef(0)
  const activeIdentity = useRef<AuthIdentity | undefined>(env.isLiveData
    ? undefined
    : { id: 'mock-operator', email: 'operator@local.test', role: 'OPERATOR' })
  const [state, setState] = useState<AuthState>(env.isLiveData
    ? { status: 'loading', identity: null, error: null }
    : { status: 'authenticated', identity: { id: 'mock-operator', email: 'operator@local.test', role: 'OPERATOR' }, error: null })

  const setAnonymous = useCallback((error: Error | null) => {
    if (activeIdentity.current) queryClient.clear()
    activeIdentity.current = undefined
    setState({ status: 'anonymous', identity: null, error })
  }, [queryClient])

  const setAuthenticated = useCallback((identity: AuthIdentity) => {
    const previous = activeIdentity.current
    if (previous && (previous.id !== identity.id || previous.role !== identity.role)) queryClient.clear()
    activeIdentity.current = identity
    setState({ status: 'authenticated', identity, error: null })
  }, [queryClient])

  const resolveIdentity = useCallback(async (session: { user?: { id?: string } } | null) => {
    const version = ++requestVersion.current
    if (!session) {
      clearCachedIdentity()
      setAnonymous(null)
      return
    }
    const userId = session.user?.id
    try {
      const identity = parseAuthIdentity(await requestJson('/auth/me'))
      writeCachedIdentity(identity, userId)
      if (version === requestVersion.current) setAuthenticated(identity)
    } catch (cause) {
      if (version === requestVersion.current) {
        const cachedIdentity = isRetryableIdentityFailure(cause) ? readCachedIdentity(userId) : undefined
        if (cachedIdentity) setAuthenticated(cachedIdentity)
        else {
          clearCachedIdentity()
          setAnonymous(cause instanceof Error ? cause : new Error('Authentication failed'))
        }
      }
    }
  }, [setAnonymous, setAuthenticated])

  useEffect(() => {
    if (!env.isLiveData) return undefined
    const supabase = getSupabaseClient()
    const expireSession = () => {
      requestVersion.current += 1
      queryClient.clear()
      clearCachedIdentity()
      void supabase.auth.signOut()
      activeIdentity.current = undefined
      setState({ status: 'anonymous', identity: null, error: new Error('Session expired') })
    }
    void supabase.auth.getSession().then(({ data }) => resolveIdentity(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase invokes this callback while its auth lock is still held. Defer
      // getSession-backed identity resolution until the lock has been released.
      window.setTimeout(() => void resolveIdentity(session), 0)
    })
    window.addEventListener(sessionExpiredEvent, expireSession)
    return () => { data.subscription.unsubscribe(); window.removeEventListener(sessionExpiredEvent, expireSession) }
  }, [queryClient, resolveIdentity])

  async function signIn(email: string, password: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error || !data.session) throw error ?? new Error('No session returned')
    await resolveIdentity(data.session)
  }

  async function signOut() {
    requestVersion.current += 1
    queryClient.clear()
    clearCachedIdentity()
    activeIdentity.current = undefined
    if (env.isLiveData) await getSupabaseClient().auth.signOut()
    setState({ status: 'anonymous', identity: null, error: null })
  }

  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
}
