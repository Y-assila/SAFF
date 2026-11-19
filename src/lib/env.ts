/** Public runtime configuration (safe to ship to browsers). */
export interface PublicConfig {
  supabaseUrl: string
  supabaseAnonKey: string
}

interface EnvLike {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Returns the config, or null when it is missing or unsafe. Plain http is accepted only for
 * local development hosts; anything else must be https.
 */
export function readPublicConfig(env: EnvLike = import.meta.env): PublicConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!rawUrl || !key) return null
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
  if (!secure) return null
  return { supabaseUrl: url.origin, supabaseAnonKey: key }
}
