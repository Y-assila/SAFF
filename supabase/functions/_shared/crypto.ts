// Small runtime-neutral crypto helpers (WebCrypto only).
const encoder = new TextEncoder()

/** Constant-time string comparison (length is not secret here: both sides are fixed-format secrets). */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null
  return Uint8Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

/**
 * Verifies Meta's webhook signature: X-Hub-Signature-256: sha256=<hex HMAC-SHA256(app secret, raw body)>.
 * crypto.subtle.verify compares in constant time.
 */
export async function verifyMetaSignature(appSecret: string, rawBody: string, header: string | null): Promise<boolean> {
  const sig = header?.startsWith('sha256=') ? hexToBytes(header.slice(7)) : null
  if (!sig || !appSecret) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, sig as BufferSource, encoder.encode(rawBody) as BufferSource)
}

/** Produces a Meta-style signature header (used by tests and the local webhook simulator). */
export async function signMetaBody(appSecret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)))
  return 'sha256=' + Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}
