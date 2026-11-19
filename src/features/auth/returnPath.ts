/** Only same-app barber paths are accepted as post-login destinations (no open redirect). */
export function safeReturnPath(from: unknown): string {
  return typeof from === 'string' && /^\/barber(\/[A-Za-z0-9-]+)*$/.test(from) && from !== '/barber/login'
    ? from
    : '/barber'
}
