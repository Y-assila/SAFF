// Phone normalisation: E.164, default region Morocco, mobile numbers only (approved Q-8: WhatsApp needs one).
// @ts-types="../_vendor/libphonenumber.d.ts"
import { parsePhoneNumberFromString } from '../_vendor/libphonenumber.js'

export function normaliseMobile(input: string): string | null {
  if (typeof input !== 'string' || input.length > 32) return null
  const phone = parsePhoneNumberFromString(input, 'MA')
  if (!phone || !phone.isValid()) return null
  const type = phone.getType()
  return type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE' ? phone.number : null
}
