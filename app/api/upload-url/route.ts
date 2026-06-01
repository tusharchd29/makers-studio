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

  const body = await req.json()
  const { taskId, taskName, clientName, fileName, mimeType } = body

  if (!taskId || !taskName || !clientName || !fileName || !mimeType)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Determine draft number
  const existing    = await getSubmissionByTaskId(taskId)
  const draftNumber = existing ? existing.draftNumber + 1 : 1
  const ext         = fileName.split('.').pop() || 'bin'
  const draftName   = `${taskName} - draft${draftNumber}.${ext}`

  // Log the folder ID being used
  const folderId_env = process.env.DRIVE_ROOT_FOLDER_ID || 'NOT_SET'
  console.log('DRIVE_ROOT_FOLDER_ID:', folderId_env)

  let folderId: string
  try {
    folderId = await getOrCreateTaskFolder(clientName, taskName)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Drive folder error:', msg)
    return NextResponse.json({ error: `Drive error: ${msg}` }, { status: 500 })
  }

  let uploadUrl: string
  try {
    uploadUrl = await createResumableUploadUrl(draftName, mimeType, folderId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Upload URL error:', msg)
    return NextResponse.json({ error: `Upload session error: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({ uploadUrl, draftName, draftNumber })
}
