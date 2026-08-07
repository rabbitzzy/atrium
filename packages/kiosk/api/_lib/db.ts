/**
 * Supabase client for Atrium's own database — `captures` and the 001 flywheel
 * tables. This is the only database Atrium reads or writes.
 *
 * Student profiles live in the BHCS portal and are fetched over its API
 * (see ./bhcs.ts), never queried directly. Atrium holds no BHCS database
 * credential at all.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let atriumClient: SupabaseClient | null = null

export function atrium(): SupabaseClient {
  if (!atriumClient) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) {
      throw new Error('Missing env vars SUPABASE_URL / SUPABASE_SERVICE_KEY')
    }
    atriumClient = createClient(url, key, { auth: { persistSession: false } })
  }
  return atriumClient
}
