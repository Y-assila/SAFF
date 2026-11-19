import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readPublicConfig } from './env'

export type SaffClient = SupabaseClient<Database>

let client: SaffClient | null = null

export function isBackendConfigured(): boolean {
  return readPublicConfig() !== null
}

/** Lazily created browser client using the PUBLIC anon key. Throws if not configured. */
export function getSupabase(): SaffClient {
  if (client) return client
  const config = readPublicConfig()
  if (!config) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  client = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Never parse auth data from the URL: SAFF has no OAuth/magic links, and customer ticket
      // tokens live in the URL fragment (/t#<token>), which must never be touched by auth.
      detectSessionInUrl: false,
    },
  })
  return client
}
