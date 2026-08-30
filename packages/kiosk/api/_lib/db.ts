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
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) {
      throw new Error('Missing env vars SUPABASE_URL / SUPABASE_SECRET_KEY')
    }
    atriumClient = createClient(url, key, { auth: { persistSession: false } })
  }
  return atriumClient
}

/**
 * Name the shape of a query result, rather than hoping it can be inferred.
 *
 * Without a generated `Database` type, supabase-js works out row types by
 * parsing the select string with conditional types. That inference is not
 * stable across TypeScript configurations: under the kiosk's own tsconfig a
 * select yields `{ id: any, … }[]`, and under the one Vercel type-checks each
 * serverless function with, the same call yields `{}` or `any`. Code written
 * against the first reading fails to compile under the second — which is why
 * the project's `tsc --noEmit` passed while every deployment failed.
 *
 * So the shape is declared at the point of the query and stops depending on
 * inference at all. `?? []` because a failed query returns null data alongside
 * its error, and every caller here wants to map over something.
 */
export function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}
