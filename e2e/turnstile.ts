import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Hermetic Turnstile for E2E (no calls to Cloudflare):
 *  - server side: a siteverify test double runs as a container on the local Supabase network, and the
 *    Edge Functions point at it via TURNSTILE_VERIFY_URL (allowed only when SAFF_ENVIRONMENT=local);
 *  - browser side: the widget script is replaced by a stand-in that yields Cloudflare's test token.
 * The application code is unchanged in both cases.
 */
export const MOCK_CONTAINER = 'saff-turnstile-mock'
export const MOCK_VERIFY_URL = `http://${MOCK_CONTAINER}:8080/siteverify`

function docker(args: string[]) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function startTurnstileMock() {
  const image = docker(['inspect', '-f', '{{.Config.Image}}', 'supabase_edge_runtime_saff'])
  const network = docker(['inspect', '-f', '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}', 'supabase_edge_runtime_saff'])
  try { docker(['rm', '-f', MOCK_CONTAINER]) } catch { /* not running */ }
  docker(['run', '-d', '--name', MOCK_CONTAINER, '--network', network,
    '-v', `${resolve('e2e/turnstile-mock')}:/mock:ro`, '--entrypoint', 'edge-runtime', image,
    'start', '--main-service=/mock', '--port=8080'])
}

export function stopTurnstileMock() {
  try { docker(['rm', '-f', MOCK_CONTAINER]) } catch { /* already gone */ }
}

const WIDGET_STUB = `
  window.turnstile = {
    render(el, opts) { el.setAttribute('data-stub', 'turnstile'); setTimeout(() => opts.callback('XXXX.DUMMY.TOKEN.XXXX'), 50); this._opts = opts; return 'stub-widget' },
    reset() { const o = this._opts; if (o) setTimeout(() => o.callback('XXXX.DUMMY.TOKEN.XXXX'), 50) },
    remove() {},
  };`

export async function stubTurnstileWidget(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: WIDGET_STUB }))
}
