/**
 * Supabase clients.
 *
 * Two logical databases, which may or may not be the same physical project:
 *   - Atrium  : owns `captures` (and the 001 flywheel tables)
 *   - BHCS    : owns `students` — the roster is read-only from here, always.
 *
 * If the BHCS_* vars are unset we assume a single shared project. That covers
 * both deployment shapes without the caller needing to know which one it is.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function client(urlVar: string, keyVar: string, fallback?: SupabaseClient): SupabaseClient {
  const url = process.env[urlVar]
  const key = process.env[keyVar]
  if (!url || !key) {
    if (fallback) return fallback
    throw new Error(`Missing env vars ${urlVar} / ${keyVar}`)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

let atriumClient: SupabaseClient | null = null
let bhcsClient: SupabaseClient | null = null

export function atrium(): SupabaseClient {
  atriumClient ??= client('SUPABASE_URL', 'SUPABASE_SERVICE_KEY')
  return atriumClient
}

export function bhcs(): SupabaseClient {
  bhcsClient ??= client('BHCS_SUPABASE_URL', 'BHCS_SUPABASE_SERVICE_KEY', atrium())
  return bhcsClient
}
