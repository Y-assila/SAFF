import { createHmac } from 'node:crypto'

function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(c)
    if (v < 0) throw new Error('invalid base32 secret')
    bits += v.toString(2).padStart(5, '0')
  }
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
}

/** RFC 6238 code (SHA-1, 6 digits, 30 s), like an authenticator app. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/** A code that stays valid for at least a few seconds (avoids typing it at the end of a window). */
export async function freshTotp(secret: string): Promise<string> {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30)
  if (left < 4) await new Promise((r) => setTimeout(r, left * 1000 + 200))
  return totp(secret)
}
