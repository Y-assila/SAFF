// Supabase Auth and "as the caller" helpers for the account functions (admin-users, account-password).
import { DbError } from './db.ts'
import { requireEnv } from './env.ts'

export class AuthApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(`auth_${status}_${code}`)
    this.status = status
    this.code = code
  }
}

/** The caller's access token (a Supabase Auth JWT), or null. */
export function bearer(req: Request): string | null {
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.get('Authorization') ?? '')
  return m ? m[1] : null
}

/**
 * Calls an RPC AS THE CALLER: PostgREST verifies the JWT and the database sees the caller's
 * claims (auth.uid(), aal). This is how admin-users proves the caller is an admin with two-factor.
 */
export async function rpcAsCaller<T>(jwt: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: requireEnv('SUPABASE_ANON_KEY'), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new DbError(res.status === 401 ? 'unauthenticated' : typeof body?.message === 'string' ? body.message : `http_${res.status}`)
  return body as T
}

/** The signed-in user behind a JWT (verified by Supabase Auth), or null. */
export async function authUser(jwt: string): Promise<{ id: string } | null> {
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: requireEnv('SUPABASE_ANON_KEY'), Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return typeof body?.id === 'string' ? { id: body.id } : null
}

/** Supabase Auth admin API with the service role (server side only). */
export async function authAdmin<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${requireEnv('SUPABASE_URL')}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new AuthApiError(res.status, String(data?.error_code ?? data?.code ?? 'error').slice(0, 60))
  return data as T
}
