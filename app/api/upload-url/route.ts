export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSubmissionByTaskId } from '@/lib/store'
import { validateFileMeta, generatePresignedUploadUrl } from '@/lib/drive'
import { acquireLock, releaseLock } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body       = await req.json()
    const { fileName, fileType, fileSize, taskId, taskName, clientName } = body

    if (!fileName || !fileType || !fileSize || !taskId || !taskName || !clientName)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const validation = validateFileMeta(fileName, fileType, fileSize)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })

    const locked = await acquireLock(taskId, user.name)
    if (!locked) return NextResponse.json({ error: 'Upload already in progress for this task. Please wait.' }, { status: 409 })

    try {
      const existing    = await getSubmissionByTaskId(taskId)
      const draftNumber = existing ? existing.draftNumber + 1 : 1
      const ext         = fileName.split('.').pop() || 'bin'
      const draftName   = `${taskName} - draft${draftNumber}.${ext}`
      const folderPath  = `${clientName}/${taskName}`
      const fileKey     = `${folderPath}/${draftName}`

      const { presignedUrl, viewUrl } = await generatePresignedUploadUrl(fileKey, fileType)
      return NextResponse.json({ presignedUrl, fileKey, draftName, draftNumber, viewUrl })
    } finally {
      await releaseLock(taskId)
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Upload URL error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
