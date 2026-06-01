export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import {
  getSubmissions, saveSubmission, getSubmissionByTaskId, updateSubmission,
  appendRevision, updateRevision, getRevisionsByTaskId,
  getTasks, saveApprovedFile,
} from '@/lib/store'
import { deleteFile } from '@/lib/drive'
import { randomUUID } from 'crypto'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let subs = await getSubmissions()
  if (user.role === 'designer') subs = subs.filter(s => s.designerName === user.name)
  return NextResponse.json(subs)
}

// POST — called after browser finishes uploading to Drive directly
// Body: { taskId, taskName, clientName, deliverableType, designerNote, fileId, draftName, draftNumber }
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { taskId, taskName, clientName, deliverableType, designerNote, fileId, draftName, draftNumber } = body
  if (!taskId || !fileId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // viewUrl already set during upload — use it directly, or derive from fileId
  const viewUrl = (body.viewUrl as string) || `https://drive.google.com/file/d/${fileId}/view`

  const now          = new Date().toISOString()
  const existing     = await getSubmissionByTaskId(taskId)
  const submissionId = existing?.id || randomUUID()

  const submission = {
    id: submissionId, taskId, taskName,
    clientName, designerName: user.name,
    deliverableType, fileType: '',
    fileName: draftName, storagePath: fileId, viewUrl,
    draftNumber, status: 'pending' as const,
    designerNote: designerNote || '', pmComment: '',
    submittedAt: now,
  }
  await saveSubmission(submission)

  await appendRevision({
    id: randomUUID(), taskId, taskName,
    clientName, designerName: user.name,
    draftNumber, storagePath: fileId, viewUrl,
    designerNote: designerNote || '', pmComment: '',
    status: 'pending', submittedAt: now,
  })

  return NextResponse.json({ id: submissionId, viewUrl, draftNumber, fileName: draftName })
}

// PUT — PM reviews a submission
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { submissionId, status, pmComment } = await req.json()
  const subs = await getSubmissions()
  const sub  = subs.find(s => s.id === submissionId)
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  await updateSubmission(sub.taskId, { status, pmComment: pmComment || '', reviewedAt: now, reviewedBy: user.name })
  await updateRevision(sub.taskId, sub.draftNumber, { pmComment: pmComment || '', status, reviewedAt: now, reviewedBy: user.name })

  if (status === 'approved') {
    const tasks = await getTasks()
    const task  = tasks.find(t => t.id === sub.taskId)
    await saveApprovedFile({
      id: randomUUID(), taskId: sub.taskId,
      taskName: sub.taskName, clientName: sub.clientName,
      designerName: sub.designerName,
      sowMonth: task?.sowMonth || '',
      deliverableType: task?.deliverableType || sub.deliverableType,
      storagePath: sub.storagePath, viewUrl: sub.viewUrl,
      totalDrafts: sub.draftNumber,
      approvedAt: now, approvedBy: user.name,
    })
    // Delete previous draft files from Drive
    const allRevisions    = await getRevisionsByTaskId(sub.taskId)
    const previousFileIds = allRevisions
      .filter(r => r.storagePath && r.storagePath !== sub.storagePath)
      .map(r => r.storagePath)
    for (const fid of previousFileIds) await deleteFile(fid)
  }

  if (status === 'rejected') {
    const allRevisions = await getRevisionsByTaskId(sub.taskId)
    for (const r of allRevisions) if (r.storagePath) await deleteFile(r.storagePath)
  }

  return NextResponse.json({ ok: true })
}
