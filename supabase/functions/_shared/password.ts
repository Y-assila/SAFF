// Temporary passwords for accounts the SAFF team creates. Shown once, never stored by SAFF.
// No look-alike characters (0/O, 1/l/I) so it can be read out or copied by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789' // 54 symbols

/** 16 random symbols in 4 groups (≈ 92 bits), e.g. "Kp7w-Qe3z-..." */
export function temporaryPassword(): string {
  const out: string[] = []
  const limit = 256 - (256 % ALPHABET.length) // rejection sampling: no modulo bias
  while (out.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limit && out.length < 16) out.push(ALPHABET[b % ALPHABET.length])
    }
  }
  return [0, 4, 8, 12].map((i) => out.slice(i, i + 4).join('')).join('-')
}

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 72 // bcrypt limit used by Supabase Auth

/** Rules for a password the user chooses (also checked by the app before sending). */
export function passwordProblem(password: unknown): 'too_short' | 'too_long' | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'too_short'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'too_long'
  return null
}
