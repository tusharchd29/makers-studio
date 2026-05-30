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

  // Get current draft number + existing storage path
  const { data: existing } = await db
    .from('makers_studio_submissions')
    .select('draft_number, storage_path')
    .eq('task_id', taskId)
    .single()

  const nextDraft = existing ? (existing.draft_number as number) + 1 : 1

  // Delete old draft file from storage so we can upload fresh
  if (existing?.storage_path) {
    await db.storage.from(BUCKET).remove([existing.storage_path as string])
  }

  // New path includes draft number so each round is distinct in the log
  // but only the latest lives in storage at any time
  const fileName    = `${taskName} - draft${nextDraft}.${ext}`
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
