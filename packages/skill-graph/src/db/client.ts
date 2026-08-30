import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SECRET_KEY']
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set')
  _client = createClient(url, key)
  return _client
}

/**
 * Name the shape of a query result, rather than hoping it can be inferred.
 *
 * Without a generated `Database` type, supabase-js works out row types by
 * parsing the select string with conditional types. That inference is not
 * stable across TypeScript configurations: under this package's tsconfig a
 * select yields `{ id: any, … }[]`, and under the one Vercel type-checks each
 * serverless function with — which these routes now pass through, since
 * skill-graph is mounted inside the kiosk deployment — the same call yields
 * `{}` or `any`. Code written against the first reading fails to compile under
 * the second, which is why `tsc --noEmit` passed while every deploy failed.
 *
 * So the shape is declared at the point of the query and stops depending on
 * inference at all. `?? []` because a failed query returns null data alongside
 * its error, and every caller here wants to map over something.
 */
export function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}
