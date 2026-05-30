export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

function toFrontend(r: Record<string, unknown>) {
  return {
    clientId: r.client_id,
    reels: r.reels || 0,
    stories: r.stories || 0,
    statics: r.statics || 0,
    videos: r.videos || 0,
    photos: r.photos || 0,
    carousels: r.carousels || 0,
    youtubeShorts: r.youtube_shorts || 0,
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { data, error } = await db.from('makers_studio_sow').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(toFrontend))
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entry = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_sow').upsert({
    client_id: entry.clientId,
    reels: entry.reels || 0,
    stories: entry.stories || 0,
    statics: entry.statics || 0,
    videos: entry.videos || 0,
    photos: entry.photos || 0,
    carousels: entry.carousels || 0,
    youtube_shorts: entry.youtubeShorts || 0,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(entry)
}
