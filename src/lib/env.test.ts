import { describe, expect, it } from 'vitest'
import { readPublicConfig } from './env'

describe('readPublicConfig', () => {
  it('accepts https project URLs and normalises to the origin', () => {
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: 'k' }))
      .toEqual({ supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'k' })
  })
  it('accepts plain http only for local development hosts', () => {
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' })).not.toBeNull()
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })
  it('rejects missing or malformed values', () => {
    expect(readPublicConfig({})).toBeNull()
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull()
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: ' ' })).toBeNull()
  })
})
