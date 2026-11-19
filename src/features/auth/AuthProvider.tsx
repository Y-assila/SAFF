import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase, isBackendConfigured } from '../../lib/supabase'
import { AuthContext, type AuthState, type SignInResult } from './authContext'

/** Barber authentication (Supabase Auth, email + password; public sign-up is disabled server-side). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isBackendConfigured()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    const supabase = getSupabase()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [configured])

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!configured) return { ok: false, reason: 'not_configured' }
      try {
        const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
        if (!error) return { ok: true }
        // One generic message for any credential problem: never reveal whether an email exists.
        return { ok: false, reason: error.status && error.status < 500 ? 'invalid_credentials' : 'network' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
    [configured],
  )

  const signOut = useCallback(async () => {
    if (configured) await getSupabase().auth.signOut()
    queryClient.clear() // drop every cached shop/queue row of the previous user
  }, [configured, queryClient])

  const value = useMemo<AuthState>(
    () => ({ configured, loading, session, signIn, signOut }),
    [configured, loading, session, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
