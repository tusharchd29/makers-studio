export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await db.from('makers_studio_clients').select('name').limit(5)
    return NextResponse.json({ ok: !error, error: error?.message, clients: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }
}
