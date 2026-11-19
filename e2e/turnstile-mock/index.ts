// OFFLINE TEST DOUBLE for Cloudflare's siteverify endpoint (E2E only; never deployed).
// Mirrors Cloudflare's documented test keys: the test secret + dummy token succeed, anything else fails.
const TEST_SECRET = '1x0000000000000000000000000000000AA'
const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

Deno.serve(async (req) => {
  const form = await req.formData().catch(() => null)
  const ok = form?.get('secret') === TEST_SECRET && form?.get('response') === TEST_TOKEN
  return Response.json(ok ? { success: true } : { success: false, 'error-codes': ['invalid-input-response'] })
})
