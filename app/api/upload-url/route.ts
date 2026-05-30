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

  // Get current draft number from DB
  const { data: existing } = await db
    .from('makers_studio_submissions')
    .select('draft_number')
    .eq('task_id', taskId)
    .single()

  const nextDraft   = existing ? (existing.draft_number as number) + 1 : 1
  const fileName    = `${taskName} - draft${nextDraft}.${ext}`
  const storagePath = `${folderPath}/${fileName}`

  // Delete file at this exact path if it already exists (failed previous attempt)
  // Supabase storage will 409 "resource already exists" if we don't clear it first
  await db.storage.from(BUCKET).remove([storagePath])

  // Also list the folder and delete any stale draft with same number from a different ext
  const { data: listed } = await db.storage.from(BUCKET).list(folderPath, { search: `${taskName} - draft${nextDraft}` })
  if (listed && listed.length > 0) {
    const stalePaths = listed.map((f: { name: string }) => `${folderPath}/${f.name}`)
    await db.storage.from(BUCKET).remove(stalePaths)
  }

  // Create signed upload URL
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to create upload URL' }, { status: 500 })

  return NextResponse.json({ signedUrl: data.signedUrl, path: storagePath, version: nextDraft, fileName })
}
