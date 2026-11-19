// Cloudflare Turnstile server-side verification (TD issue 6). Fails closed.
import { ConfigError, isLocal, requireEnv } from './env.ts'

const CLOUDFLARE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * The verify URL is Cloudflare's. A different URL (an offline test double) is accepted only when
 * SAFF_ENVIRONMENT=local; anywhere else the override must still be https or startup config fails.
 */
function verifyUrl(): string {
  const override = Deno.env.get('TURNSTILE_VERIFY_URL')?.trim()
  if (!override) return CLOUDFLARE_VERIFY_URL
  if (!isLocal()) throw new ConfigError('TURNSTILE_VERIFY_URL may only be overridden when SAFF_ENVIRONMENT=local')
  return override
}

export async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const form = new FormData()
  form.append('secret', requireEnv('TURNSTILE_SECRET'))
  form.append('response', token)
  if (remoteIp !== 'unknown') form.append('remoteip', remoteIp)
  try {
    const res = await fetch(verifyUrl(), { method: 'POST', body: form, signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return false
    const body = await res.json()
    return body?.success === true
  } catch (e) {
    if (e instanceof ConfigError) throw e
    return false // network failure or timeout: fail closed
  }
}
