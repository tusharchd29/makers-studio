export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSubmissionByTaskId } from '@/lib/store'
import { getOrCreateTaskFolder, uploadFileToDrive, makePublic } from '@/lib/drive'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData   = await req.formData()
    const file       = formData.get('file') as File | null
    const taskId     = formData.get('taskId') as string
    const taskName   = formData.get('taskName') as string
    const clientName = formData.get('clientName') as string

    if (!file || !taskId || !taskName || !clientName)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // Draft number
    const existing    = await getSubmissionByTaskId(taskId)
    const draftNumber = existing ? existing.draftNumber + 1 : 1
    const ext         = file.name.split('.').pop() || 'bin'
    const draftName   = `${taskName} - draft${draftNumber}.${ext}`

    // Get/create folder structure
    const folderId = await getOrCreateTaskFolder(clientName, taskName)

    // Upload file via multipart (server-side, no quota issues)
    const arrayBuf = await file.arrayBuffer()
    const buffer   = Buffer.from(arrayBuf)
    const fileId   = await uploadFileToDrive(draftName, file.type || 'application/octet-stream', buffer, folderId)

    // Make publicly viewable
    const viewUrl = await makePublic(fileId)

    return NextResponse.json({ fileId, draftName, draftNumber, viewUrl })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
