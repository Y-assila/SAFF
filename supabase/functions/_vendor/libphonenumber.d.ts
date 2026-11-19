// Types for the vendored bundle (subset used by the Edge Functions).
export interface PhoneNumber {
  number: string
  isValid(): boolean
  getType(): string | undefined
}
export function parsePhoneNumberFromString(text: string, defaultCountry?: string): PhoneNumber | undefined
