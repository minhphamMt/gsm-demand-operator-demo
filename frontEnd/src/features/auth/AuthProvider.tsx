import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type PropsWithChildren } from 'react'

import { parseAuthIdentity } from '@/features/auth/model/authIdentity'
import { AuthContext } from '@/features/auth/model/AuthContext'
import type { AuthState } from '@/features/auth/model/types'
import { requestJson, sessionExpiredEvent } from '@/shared/api/client'
import { getSupabaseClient } from '@/shared/api/supabase'
import { env } from '@/shared/config/env'

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const requestVersion = useRef(0)
  const [state, setState] = useState<AuthState>(env.isLiveData
    ? { status: 'loading', identity: null, error: null }
    : { status: 'authenticated', identity: { id: 'mock-operator', email: 'operator@local.test', role: 'OPERATOR' }, error: null })

  async function resolveIdentity(hasSession: boolean) {
    const version = ++requestVersion.current
    if (!hasSession) {
      setState({ status: 'anonymous', identity: null, error: null })
      return
    }
    try {
      const identity = parseAuthIdentity(await requestJson('/auth/me'))
      if (version === requestVersion.current) setState({ status: 'authenticated', identity, error: null })
    } catch (cause) {
      if (version === requestVersion.current) {
        setState({ status: 'anonymous', identity: null, error: cause instanceof Error ? cause : new Error('Authentication failed') })
      }
    }
  }

  useEffect(() => {
    if (!env.isLiveData) return undefined
    const supabase = getSupabaseClient()
    const expireSession = () => {
      requestVersion.current += 1
      queryClient.clear()
      void supabase.auth.signOut()
      setState({ status: 'anonymous', identity: null, error: new Error('Session expired') })
    }
    void supabase.auth.getSession().then(({ data }) => resolveIdentity(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase invokes this callback while its auth lock is still held. Defer
      // getSession-backed identity resolution until the lock has been released.
      window.setTimeout(() => void resolveIdentity(Boolean(session)), 0)
    })
    window.addEventListener(sessionExpiredEvent, expireSession)
    return () => { data.subscription.unsubscribe(); window.removeEventListener(sessionExpiredEvent, expireSession) }
  }, [queryClient])

  async function signIn(email: string, password: string) {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error || !data.session) throw error ?? new Error('No session returned')
    await resolveIdentity(true)
  }

  async function signOut() {
    requestVersion.current += 1
    queryClient.clear()
    if (env.isLiveData) await getSupabaseClient().auth.signOut()
    setState({ status: 'anonymous', identity: null, error: null })
  }

  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
}
