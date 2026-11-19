import { adminClient } from './fixtures'
import { startTurnstileMock, stopTurnstileMock } from './turnstile'

/** Fails fast when the local backend is not running; starts the offline Turnstile double. */
export default async function globalSetup() {
  const { error } = await adminClient().from('shops').select('id').limit(1)
  if (error) throw new Error(`Local Supabase not reachable: ${error.message}. Run \`npm run db:start\`.`)
  startTurnstileMock()
  return () => stopTurnstileMock()
}
