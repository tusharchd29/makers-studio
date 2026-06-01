export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSubmissionByTaskId } from '@/lib/store'
import { getOrCreateTaskFolder } from '@/lib/drive'
import { google } from 'googleapis'
import { Readable } from 'stream'

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const taskId   = formData.get('taskId') as string
    const taskName = formData.get('taskName') as string
    const clientName = formData.get('clientName') as string

    if (!file || !taskId || !taskName || !clientName)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // Draft number
    const existing    = await getSubmissionByTaskId(taskId)
    const draftNumber = existing ? existing.draftNumber + 1 : 1
    const ext         = file.name.split('.').pop() || 'bin'
    const draftName   = `${taskName} - draft${draftNumber}.${ext}`

    // Get/create folder
    const folderId = await getOrCreateTaskFolder(clientName, taskName)

    // Upload to Drive via service account (server-side, no CORS issues)
    const drive    = getDriveClient()
    const arrayBuf = await file.arrayBuffer()
    const buffer   = Buffer.from(arrayBuf)
    const stream   = Readable.from(buffer)

    const driveRes = await drive.files.create({
      requestBody: {
        name: draftName,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id,name',
    })

    const fileId = driveRes.data.id!

    // Make file readable by anyone with the link
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    })

    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`

    return NextResponse.json({ fileId, draftName, draftNumber, viewUrl })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
