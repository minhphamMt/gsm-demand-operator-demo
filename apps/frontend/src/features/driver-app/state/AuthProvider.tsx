import type { PropsWithChildren } from 'react'

import { useAuth as useSystemAuth } from '@/features/auth'

type DriverAuthStatus = 'loading' | 'signedOut' | 'notADriver' | 'ready'

/**
 * Compatibility boundary for the imported driver UI.
 *
 * Authentication remains owned by the shared application AuthProvider. Keeping
 * this small adapter lets the original driver components retain their status
 * vocabulary without creating a second Supabase session owner.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  return children
}

export function useAuth() {
  const auth = useSystemAuth()
  let status: DriverAuthStatus
  if (auth.status === 'loading') status = 'loading'
  else if (auth.status === 'anonymous') status = 'signedOut'
  else if (auth.identity.role !== 'DRIVER') status = 'notADriver'
  else status = 'ready'

  return {
    status,
    profileError: auth.status === 'anonymous' ? auth.error?.message ?? null : null,
    driverId: status === 'ready' && auth.status === 'authenticated' ? auth.identity.id : null,
    signIn: async (email: string, password: string) => {
      try {
        await auth.signIn(email, password)
        return { error: null }
      } catch (cause) {
        return { error: cause instanceof Error ? cause.message : 'Đăng nhập thất bại.' }
      }
    },
    signOut: auth.signOut,
  }
}

export function useDriverId(): string {
  const { driverId } = useAuth()
  if (!driverId) throw new Error('useDriverId dùng ngoài vùng tài xế đã đăng nhập')
  return driverId
}
