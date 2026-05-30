import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL not set')
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

// Service-role client — server-side only, never expose to browser
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export const BUCKET = 'makers-studio'
