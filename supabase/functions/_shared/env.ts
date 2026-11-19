// Environment access for Edge Functions. Missing security configuration fails closed.
export class ConfigError extends Error {}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new ConfigError(`missing environment variable ${name}`)
  return value
}

export function isLocal(): boolean {
  return Deno.env.get('SAFF_ENVIRONMENT') === 'local'
}
