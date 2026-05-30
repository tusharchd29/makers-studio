// All Supabase access goes through this file.
// getDB() is always called inside async functions — never at module level.

export const BUCKET = 'makers-studio'

export async function getDB() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key, { auth: { persistSession: false } })
}
