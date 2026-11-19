// Rate limits keyed by HMAC(pepper, kind|value): raw IPs and phone numbers never reach the database.
import { rpc } from './db.ts'
import { requireEnv } from './env.ts'

const encoder = new TextEncoder()

async function hashKey(kind: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(requireEnv('RATE_LIMIT_PEPPER')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${kind}|${value}`)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Counts one hit; returns false when the limit for this window is exceeded. */
export async function allow(kind: string, value: string, windowSeconds: number, max: number): Promise<boolean> {
  return rpc<boolean>('check_rate_limit', {
    p_key: await hashKey(kind, value), p_window_seconds: windowSeconds, p_max: max,
  })
}

// Approved values (RPC-SPEC §9, Q-9): per 10 minutes.
export const LIMITS = {
  joinPerIp: { window: 600, max: 10 },
  joinPerPhone: { window: 600, max: 3 },
  joinPerShop: { window: 600, max: 120 },
  ticketFailuresPerIp: { window: 600, max: 30 },
} as const
