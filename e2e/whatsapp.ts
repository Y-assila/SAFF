import { readFileSync } from 'node:fs'
import { adminClient } from './fixtures'
import { startMockContainer, stopMockContainer } from './turnstile'

/** Offline Meta Cloud API double: reachable by the Edge Functions as http://saff-whatsapp-mock:8080. */
export const WHATSAPP_MOCK = 'saff-whatsapp-mock'
export const WHATSAPP_MOCK_HOST_URL = 'http://127.0.0.1:54330'

/** Reads a value from supabase/functions/.env (local stack only). */
export function functionsEnv(key: string): string {
  const text = readFileSync('supabase/functions/.env', 'utf8')
  const value = text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
  if (!value) throw new Error(`${key} missing from supabase/functions/.env`)
  return value
}

export async function startWhatsAppMock() {
  startMockContainer(WHATSAPP_MOCK, 'e2e/whatsapp-mock', '127.0.0.1:54330:8080')
  // Point the database's dispatcher wake-up at the local function (stored in Vault).
  const { error } = await adminClient().rpc('admin_configure_whatsapp_dispatch', {
    p_url: 'http://supabase_kong_saff:8000/functions/v1/whatsapp-dispatch',
    p_secret: functionsEnv('DISPATCH_SECRET'),
  })
  if (error) throw error
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${WHATSAPP_MOCK_HOST_URL}/_messages`)).ok) return
    } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('WhatsApp mock did not start')
}

export function stopWhatsAppMock() {
  stopMockContainer(WHATSAPP_MOCK)
}

export interface MockMessage { id: string; to: string; template: string; language: string; parameters: string[] }

export async function sentMessages(): Promise<MockMessage[]> {
  return (await fetch(`${WHATSAPP_MOCK_HOST_URL}/_messages`)).json()
}

/** Polls until `check` returns a value (or throws after `timeoutMs`). */
export async function waitFor<T>(check: () => Promise<T | null | undefined>, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > until) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 300))
  }
}
