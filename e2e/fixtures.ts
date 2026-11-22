import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Database } from '../src/lib/database.types'

/** Local stack only: read URL and service key from `supabase status` (never hard-coded). */
export function localStack() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1]
  const url = get('API_URL')
  const serviceKey = get('SERVICE_ROLE_KEY')
  const anonKey = get('ANON_KEY')
  const dbUrl = get('DB_URL')
  if (!url || !serviceKey || !anonKey || !dbUrl) throw new Error('Local Supabase is not running (npm run db:start).')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url) || !/@(127\.0\.0\.1|localhost):/.test(dbUrl)) {
    throw new Error('E2E fixtures refuse to run against a non-local stack.')
  }
  return { url, serviceKey, anonKey, dbUrl }
}

let admin: SupabaseClient<Database> | null = null
export function adminClient() {
  if (!admin) {
    const { url, serviceKey } = localStack()
    admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

export const PASSWORD = 'E2e-Password-123!'

export async function createUser(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@e2e.test`
  const { data, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  return { id: data.user.id, email }
}

/**
 * Makes a user a SAFF admin, as the bootstrap SQL does (docs/OPERATIONS.md). platform_admins is closed
 * to every API role, even the service role, so this goes straight to the local database.
 */
export function grantPlatformAdmin(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('bad user id')
  execSync(`psql "${localStack().dbUrl}" -v ON_ERROR_STOP=1 -qc "insert into public.platform_admins (user_id) values ('${userId}')"`, { stdio: 'ignore' })
}

/** A fresh shop with an owner and a barber (service role = platform admin, as in production onboarding). */
export async function createShopWithStaff() {
  const slug = `e2e-${randomUUID().slice(0, 8)}`
  const { data: shop, error } = await adminClient().from('shops').insert({ name: `E2E Salon ${slug.slice(4)}`, slug }).select('id, slug, name').single()
  if (error) throw error
  const owner = await createUser('owner')
  const barber = await createUser('barber')
  const { error: memberError } = await adminClient().from('shop_members').insert([
    { shop_id: shop.id, user_id: owner.id, role: 'owner' },
    { shop_id: shop.id, user_id: barber.id, role: 'barber' },
  ])
  if (memberError) throw memberError
  return { shop, owner, barber }
}

/** What the join-queue Edge Function will do in Milestone 4: call join_queue as the service role. */
export async function joinQueue(slug: string, name: string, phone: string) {
  const { data, error } = await adminClient().rpc('join_queue', {
    p_shop_slug: slug, p_name: name, p_phone_e164: phone, p_locale: 'fr',
    p_consent: true, p_consent_text_version: 'e2e', p_client_request_id: randomUUID(),
  })
  if (error) throw error
  return data as { result: string; ticket_number: number }
}

/** Today's date in the shop's time zone (sessions are keyed by shop-local date). */
export function shopToday(timeZone = 'Africa/Casablanca'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Signs a barber in with the public anon key, exactly as the barber app does. */
export async function barberClient(email: string) {
  const { url, anonKey } = localStack()
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

/** A shop with an open queue, ready for customers. */
export async function openShop() {
  const staff = await createShopWithStaff()
  const barber = await barberClient(staff.barber.email)
  const { data, error } = await barber.rpc('start_queue', { p_shop_id: staff.shop.id })
  if (error) throw error
  return { ...staff, barberRpc: barber, sessionId: (data as { session_id: string }).session_id }
}

/** Clears rate-limit counters (local stack only) so tests do not throttle each other. */
export async function resetRateLimits() {
  const { error } = await adminClient().from('rate_limits').delete().gte('hits', 0)
  if (error) throw error
}

/**
 * Waits until Realtime actually delivers database pings. On a freshly started stack, Realtime builds its
 * broadcast pipeline lazily when the first client subscribes, and pings sent before that are dropped (the app
 * then falls back to polling). Tests that assert live updates within seconds must start on a warm pipeline.
 */
export async function warmRealtime(timeoutMs = 60_000) {
  const { shop, barber: staff } = await createShopWithStaff()
  const barber = await barberClient(staff.email)
  const { data, error } = await barber.rpc('start_queue', { p_shop_id: shop.id })
  if (error) throw error
  const sessionId = (data as { session_id: string }).session_id
  const { url, anonKey } = localStack()
  const listener = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let received = false
  const channel = listener.channel(`qs:${sessionId}`).on('broadcast', { event: 'queue_changed' }, () => { received = true })
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Realtime subscription timed out')), timeoutMs)
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(t); resolve() } })
  })
  const until = Date.now() + timeoutMs
  let paused = false
  while (!received) {
    if (Date.now() > until) throw new Error('Realtime never delivered a ping')
    // Each pause/resume commits a change, and every committed change sends one ping.
    await barber.rpc(paused ? 'resume_queue' : 'pause_queue', { p_session_id: sessionId })
    paused = !paused
    await new Promise((r) => setTimeout(r, 500))
  }
  await listener.removeChannel(channel)
}
