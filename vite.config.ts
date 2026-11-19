import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Writes the Supabase origin into the CSP of dist/_headers (connect-src needs https + wss for
 * the API and Realtime). The origin differs per environment, so it is injected at build time.
 */
function cspConnectSrc(mode: string): Plugin {
  return {
    name: 'saff-csp-connect-src',
    apply: 'build',
    writeBundle(options) {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const file = resolve(options.dir ?? 'dist', '_headers')
      let origin: URL
      try {
        origin = new URL(env.VITE_SUPABASE_URL ?? '')
      } catch {
        this.warn('VITE_SUPABASE_URL is not set: CSP connect-src stays \'self\' (backend calls will be blocked).')
        return
      }
      const ws = origin.protocol === 'https:' ? `wss://${origin.host}` : `ws://${origin.host}`
      const headers = readFileSync(file, 'utf8')
      if (!headers.includes("connect-src 'self'")) this.error("_headers: connect-src 'self' placeholder not found")
      writeFileSync(file, headers.replace("connect-src 'self'", `connect-src 'self' ${origin.origin} ${ws}`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cspConnectSrc(mode)],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Unit tests never talk to a backend.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
}))
