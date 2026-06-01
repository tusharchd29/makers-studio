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
  let folderId: string
  try {
    folderId = await getOrCreateTaskFolder(clientName, taskName)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Most common cause: Drive folder not shared with service account
    if (msg.includes('File not found') || msg.includes('not found')) {
      return NextResponse.json({
        error: 'Google Drive folder is not accessible. Please share the Drive folder with: maker-studio@makers-studio-498110.iam.gserviceaccount.com (Editor access)'
      }, { status: 500 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  let uploadUrl: string
  try {
    uploadUrl = await createResumableUploadUrl(draftName, mimeType, folderId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Failed to create upload session: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({ uploadUrl, draftName, draftNumber })
}
