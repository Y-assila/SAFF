export type AuthArea = 'barber' | 'admin'

/** Only same-app paths of the given area are accepted as post-login destinations (no open redirect). */
export function safeReturnPath(from: unknown, area: AuthArea = 'barber'): string {
  const home = `/${area}`
  const pattern = area === 'admin' ? /^\/admin(\/[A-Za-z0-9-]+)*$/ : /^\/barber(\/[A-Za-z0-9-]+)*$/
  return typeof from === 'string' && pattern.test(from) && from !== `${home}/login` ? from : home
}
