export type AppRole = 'OPERATOR' | 'DRIVER'

export type AuthIdentity = {
  id: string
  email: string | null
  role: AppRole
}

export type AuthState =
  | { status: 'loading'; identity: null; error: null }
  | { status: 'anonymous'; identity: null; error: Error | null }
  | { status: 'authenticated'; identity: AuthIdentity; error: null }
