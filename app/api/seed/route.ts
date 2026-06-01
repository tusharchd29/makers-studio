export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ensureAllTabs, appendRow } from '@/lib/sheets'
import { CLIENTS } from '@/lib/types'
import { SEEDED_SOW } from '@/lib/seedSOW'

// One-time seed endpoint — call once to populate the sheet
// Protected by a simple token so it can't be abused
const SEED_TOKEN = process.env.SEED_TOKEN || 'meraki-seed-2026'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Create all tabs with headers
    await ensureAllTabs()

    // 2. Seed clients tab
    for (const c of CLIENTS) {
      await appendRow('clients', { id: c.id, name: c.name, drive_folder_id: '' })
    }

    // 3. Seed SOW tab
    for (const e of SEEDED_SOW) {
      await appendRow('sow', {
        client_id: e.clientId,
        service_type: e.serviceType,
        total_creatives: e.totalCreatives,
        priority: e.priority,
        status: e.status,
        reels: e.reels,
        stories: e.stories,
        statics: e.statics,
        videos: e.videos,
        photos: e.photos,
        carousels: e.carousels,
        youtube_shorts: e.youtubeShorts,
      })
    }

    return NextResponse.json({
      ok: true,
      message: `Seeded ${CLIENTS.length} clients and ${SEEDED_SOW.length} SOW entries`
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
