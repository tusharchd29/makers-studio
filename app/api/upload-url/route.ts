export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSubmissionByTaskId } from '@/lib/store'
import { validateFileMeta, multipartUpload } from '@/lib/drive'
import { acquireLock, releaseLock } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let taskId = ''
  try {
    const formData   = await req.formData()
    const file       = formData.get('file') as File | null
    taskId           = formData.get('taskId') as string
    const taskName   = formData.get('taskName') as string
    const clientName = formData.get('clientName') as string

    if (!file || !taskId || !taskName || !clientName)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const validation = validateFileMeta(file.name, file.type || '', file.size)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })

    const locked = await acquireLock(taskId, user.name)
    if (!locked) return NextResponse.json({ error: 'Upload already in progress for this task. Please wait.' }, { status: 409 })

    try {
      const existing    = await getSubmissionByTaskId(taskId)
      const draftNumber = existing ? existing.draftNumber + 1 : 1
      const ext         = file.name.split('.').pop() || 'bin'
      const draftName   = `${taskName} - draft${draftNumber}.${ext}`
      const folderPath  = `${clientName}/${taskName}`
      const fileKey     = `${folderPath}/${draftName}`

      // Stream file through Vercel to DO Spaces via S3 multipart upload
      // File bytes are chunked — never fully buffered in memory
      const arrayBuf = await file.arrayBuffer()
      const buffer   = Buffer.from(arrayBuf)
      const { viewUrl } = await multipartUpload(fileKey, file.type || 'application/octet-stream', buffer)

      return NextResponse.json({ fileId: fileKey, draftName, draftNumber, viewUrl })
    } finally {
      await releaseLock(taskId)
    }

  } catch (e: unknown) {
    if (taskId) await releaseLock(taskId).catch(() => {})
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
