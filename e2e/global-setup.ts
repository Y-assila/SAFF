import { adminClient } from './fixtures'

/** Fails fast with a clear message when the local backend is not running. */
export default async function globalSetup() {
  const { error } = await adminClient().from('shops').select('id').limit(1)
  if (error) throw new Error(`Local Supabase not reachable: ${error.message}. Run \`npm run db:start\`.`)
}
