/** Same rules as the account-password Edge Function (supabase/functions/_shared/password.ts). */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 72

export function passwordProblem(password: string): 'too_short' | 'too_long' | null {
  if (password.length < PASSWORD_MIN) return 'too_short'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'too_long'
  return null
}
