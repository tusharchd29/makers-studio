export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

const BUCKET = 'makers-studio'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { folderPath, taskName, taskId, ext } = await req.json()
  if (!folderPath || !taskName || !ext) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  // Get current draft number
  const { data: existing } = await db
    .from('makers_studio_submissions')
    .select('draft_number')
    .eq('task_id', taskId)
    .single()

  const nextDraft = existing ? (existing.draft_number as number) + 1 : 1

  // Fixed path — draft always overwrites same file (no version suffix)
  // e.g. Asia Cosmetic/June 2026/Videos/Asia Cosmetic Reel - draft.mp4
  const fileName    = `${taskName} - draft.${ext}`
  const storagePath = `${folderPath}/${fileName}`

  // Create signed upload URL (1 hour)
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to create upload URL' }, { status: 500 })

  return NextResponse.json({
    signedUrl: data.signedUrl,
    path: storagePath,
    version: nextDraft,
    fileName,
  })
}
