export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { CLIENTS } from '@/lib/types'
import { SEEDED_SOW } from '@/lib/seedSOW'

const SEED_TOKEN = 'meraki-seed-2026'

async function runSeed() {
  const sb = getSupabase()

  // 1. Seed clients — only if empty
  const { data: existingClients } = await sb.from('clients').select('id')
  if (!existingClients || existingClients.length === 0) {
    await sb.from('clients').upsert(CLIENTS.map(c => ({ id: c.id, name: c.name })), { onConflict: 'id' })
  }

  // 2. Seed SOW — only if empty
  const { data: existingSOW } = await sb.from('sow').select('client_id')
  if (!existingSOW || existingSOW.length === 0) {
    await sb.from('sow').upsert(SEEDED_SOW.map(e => ({
      client_id: e.clientId, service_type: e.serviceType,
      total_creatives: e.totalCreatives, priority: e.priority,
      status: e.status, reels: e.reels, stories: e.stories,
      statics: e.statics, videos: e.videos, photos: e.photos,
      carousels: e.carousels, youtube_shorts: e.youtubeShorts,
      approved_count: 0,
    })), { onConflict: 'client_id' })
  }

  return {
    clients: !existingClients || existingClients.length === 0 ? `seeded ${CLIENTS.length}` : `already had ${existingClients.length}`,
    sow: !existingSOW || existingSOW.length === 0 ? `seeded ${SEEDED_SOW.length}` : `already had ${existingSOW.length}`,
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== SEED_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runSeed()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (token !== SEED_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runSeed()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
