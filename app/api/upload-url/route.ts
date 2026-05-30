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

  const { folderPath, taskName, ext } = await req.json()
  if (!folderPath || !taskName || !ext) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  // Auto-version: count existing files with same task name in this folder
  const { data: existing } = await db.storage.from(BUCKET).list(folderPath, { search: taskName })
  const versions = (existing || []).map((f: { name: string }) => {
    const m = f.name.match(/- v(\d+)\./)
    return m ? parseInt(m[1]) : 0
  })
  const version     = versions.length > 0 ? Math.max(...versions) + 1 : 1
  const fileName    = `${taskName} - v${version}.${ext}`
  const storagePath = `${folderPath}/${fileName}`

  // Create signed upload URL — valid for 1 hour
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to create upload URL' }, { status: 500 })

  return NextResponse.json({ signedUrl: data.signedUrl, path: storagePath, version, fileName })
}
