// Returns a resumable upload URL so the browser can upload large files directly to Drive
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSubmissionByTaskId } from '@/lib/store'
import { getOrCreateTaskFolder, createResumableUploadUrl } from '@/lib/drive'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId, taskName, clientName, fileName, mimeType } = await req.json()
  if (!taskId || !taskName || !clientName || !fileName || !mimeType)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Determine draft number
  const existing    = await getSubmissionByTaskId(taskId)
  const draftNumber = existing ? existing.draftNumber + 1 : 1
  const ext         = fileName.split('.').pop() || 'bin'
  const draftName   = `${taskName} - draft${draftNumber}.${ext}`

  // Get or create folder: Uploads / clientName / taskName
  const folderId  = await getOrCreateTaskFolder(clientName, taskName)
  const uploadUrl = await createResumableUploadUrl(draftName, mimeType, folderId)

  return NextResponse.json({ uploadUrl, draftName, draftNumber })
}
