// NOTE: Do NOT import this at the top level of any file that gets
// statically analyzed by Next.js at build time.
// Always use getSupabase() inside async functions only.

export const BUCKET = 'makers-studio'

export async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('SUPABASE_URL not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key, { auth: { persistSession: false } })
}
