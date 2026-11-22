/** Short local date and time for console tables (Latin digits in every language). */
export function formatDateTime(iso: string | null | undefined, language: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(`${language}-u-nu-latn`, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}
