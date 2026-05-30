export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return NextResponse.json({
    supabase_url_set: !!url,
    supabase_url_length: url.length,
    supabase_url_starts: url.slice(0, 30),
    supabase_url_charCodes: [...url.slice(0, 10)].map(c => c.charCodeAt(0)),
    key_set: !!key,
    key_length: key.length,
    key_starts: key.slice(0, 20),
  })
}
