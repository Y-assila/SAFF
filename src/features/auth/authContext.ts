import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type SignInResult = { ok: true } | { ok: false; reason: 'invalid_credentials' | 'not_configured' | 'network' }

export interface AuthState {
  /** False when no Supabase project is configured for this build. */
  configured: boolean
  loading: boolean
  session: Session | null
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
