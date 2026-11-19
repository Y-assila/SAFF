// Stateless ticket tokens (TD §7). Runtime-neutral: WebCrypto only (Deno and Node 22 alike).
//   v1.<base64url(ticket_id, 16 bytes)>.<base64url(HMAC-SHA256(secret_v1, 'ticket|' + id + '|' + token_version))>
// The database stores no token; bumping tickets.token_version revokes a link.

const TOKEN_RE = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function uuidToBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, '')
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (encoder.encode(secret).length < 32) throw new Error('ticket secret must be at least 32 bytes')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function message(id: string, tokenVersion: number): Uint8Array {
  return encoder.encode(`ticket|${id}|${tokenVersion}`)
}

export async function signTicketToken(secret: string, ticketId: string, tokenVersion: number): Promise<string> {
  if (!UUID_RE.test(ticketId)) throw new Error('invalid ticket id')
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), message(ticketId, tokenVersion)))
  return `v1.${toBase64Url(uuidToBytes(ticketId))}.${toBase64Url(sig)}`
}

/** Extracts the ticket id from a well-formed token. Does NOT authenticate it. */
export function parseTicketToken(token: string | null | undefined): { ticketId: string; signature: Uint8Array } | null {
  const match = TOKEN_RE.exec(token ?? '')
  if (!match) return null
  const idBytes = fromBase64Url(match[1])
  const signature = fromBase64Url(match[2])
  if (idBytes.length !== 16 || signature.length !== 32) return null
  return { ticketId: bytesToUuid(idBytes), signature }
}

/** Constant-time verification (crypto.subtle.verify) against the ticket's CURRENT token_version. */
export async function verifyTicketToken(secret: string, token: string, tokenVersion: number): Promise<boolean> {
  const parsed = parseTicketToken(token)
  if (!parsed) return false
  return crypto.subtle.verify('HMAC', await hmacKey(secret), parsed.signature as BufferSource, message(parsed.ticketId, tokenVersion) as BufferSource)
}
