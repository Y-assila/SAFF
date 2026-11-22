import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

/** Error from a signed-in Edge Function call; `code` is the function's `{ error }` value. */
export class FunctionError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

/** Calls an Edge Function with the current session's access token (supabase-js adds it). */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(name, { body })
  if (!error) return data as T
  if (error instanceof FunctionsHttpError) {
    const payload = await (error.context as Response).json().catch(() => null)
    throw new FunctionError(typeof payload?.error === 'string' ? payload.error : 'generic')
  }
  throw new FunctionError(error instanceof FunctionsFetchError ? 'network' : 'generic')
}
