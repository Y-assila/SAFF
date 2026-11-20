// OFFLINE TEST DOUBLE for Meta's WhatsApp Cloud API (E2E only; never deployed).
//   POST /<version>/<phone-number-id>/messages   accepts template messages
//     recipient ending in 99 → 503 (temporary, code 131000) · ending in 98 → 400 (permanent, 131026)
//   GET /_messages → what was "sent" (tests read it) · DELETE /_messages → reset
const EXPECTED_TOKEN = 'local-placeholder-token'
type Sent = { id: string; to: string; template: string; language: string; parameters: string[] }
let sent: Sent[] = []
let counter = 0

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/_messages') {
    if (req.method === 'DELETE') sent = []
    return Response.json(sent)
  }
  if (req.method !== 'POST' || !/^\/v[\d.]+\/\d+\/messages$/.test(url.pathname)) {
    return Response.json({ error: { code: 100, message: 'Unsupported request' } }, { status: 400 })
  }
  if (req.headers.get('Authorization') !== `Bearer ${EXPECTED_TOKEN}`) {
    return Response.json({ error: { code: 190, message: 'Invalid OAuth access token' } }, { status: 401 })
  }
  const body = await req.json()
  if (body?.messaging_product !== 'whatsapp' || body?.type !== 'template' || !/^\d{8,15}$/.test(body?.to ?? '')) {
    return Response.json({ error: { code: 100, message: 'Invalid parameter' } }, { status: 400 })
  }
  if (body.to.endsWith('99')) return Response.json({ error: { code: 131000, message: 'Something went wrong' } }, { status: 503 })
  if (body.to.endsWith('98')) return Response.json({ error: { code: 131026, message: 'Message undeliverable' } }, { status: 400 })
  const id = `wamid.MOCK${++counter}${Date.now()}`
  sent.push({
    id, to: body.to, template: body.template?.name, language: body.template?.language?.code,
    parameters: (body.template?.components?.[0]?.parameters ?? []).map((p: { text: string }) => p.text),
  })
  return Response.json({ messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id }] })
})
