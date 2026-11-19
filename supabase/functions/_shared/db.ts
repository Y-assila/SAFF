// Minimal PostgREST client using the service role (Edge Functions only; never in the browser).
import { requireEnv } from './env.ts'

export class DbError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

function headers(): Record<string, string> {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

/** Calls a SECURITY DEFINER RPC. Database business errors (P0001) surface as DbError(code). */
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new DbError(typeof body?.message === 'string' ? body.message : `http_${res.status}`)
  return body as T
}

/** Reads rows with a PostgREST query string, e.g. select('tickets', 'id=eq.X&select=token_version'). */
export async function select<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/rest/v1/${table}?${query}`, { headers: headers() })
  if (!res.ok) throw new DbError(`http_${res.status}`)
  return (await res.json()) as T[]
}
