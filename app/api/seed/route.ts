export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ensureAllTabs, appendRow, readAll } from '@/lib/sheets'
import { CLIENTS } from '@/lib/types'
import { SEEDED_SOW } from '@/lib/seedSOW'

const SEED_TOKEN = 'meraki-seed-2026'

async function runSeed() {
  // 1. Ensure all tabs exist with headers
  await ensureAllTabs()

  // 2. Seed clients — only if empty
  const existingClients = await readAll<{id:string}>('clients')
  if (existingClients.length === 0) {
    for (const c of CLIENTS) {
      await appendRow('clients', { id: c.id, name: c.name, drive_folder_id: '' })
    }
  }

  // 3. Seed SOW — only if empty
  const existingSOW = await readAll<{client_id:string}>('sow')
  if (existingSOW.length === 0) {
    for (const e of SEEDED_SOW) {
      await appendRow('sow', {
        client_id: e.clientId, service_type: e.serviceType,
        total_creatives: e.totalCreatives, priority: e.priority,
        status: e.status, reels: e.reels, stories: e.stories,
        statics: e.statics, videos: e.videos, photos: e.photos,
        carousels: e.carousels, youtube_shorts: e.youtubeShorts,
      })
    }
  }

  return {
    clients: existingClients.length === 0 ? `seeded ${CLIENTS.length}` : `already had ${existingClients.length}`,
    sow: existingSOW.length === 0 ? `seeded ${SEEDED_SOW.length}` : `already had ${existingSOW.length}`,
  }
}

// GET — trigger via browser (token in query param)
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

// POST — trigger programmatically
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
