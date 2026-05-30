import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const BUCKET = 'makers-studio'

// Lazy singleton — only created when first called, not at module load
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('SUPABASE_URL not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}
