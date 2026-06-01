export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import {
  getSubmissions, saveSubmission, getSubmissionByTaskId, updateSubmission,
  appendRevision, updateRevision, getRevisionsByTaskId,
  getTasks, saveApprovedFile,
} from '@/lib/store'
import { uploadFile, ensureFolder, getRootFolderId, deleteFile } from '@/lib/drive'
import { randomUUID } from 'crypto'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let subs = getSubmissions()
  if (user.role === 'designer') subs = subs.filter(s => s.designerName === user.name)
  return NextResponse.json(subs)
}

// POST — designer uploads a new draft (multipart/form-data)
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file            = formData.get('file') as File | null
  const taskId          = formData.get('taskId') as string
  const taskName        = formData.get('taskName') as string
  const clientName      = formData.get('clientName') as string
  const deliverableType = formData.get('deliverableType') as string
  const designerNote    = formData.get('designerNote') as string || ''

  if (!file || !taskId || !taskName || !clientName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Determine draft number
  const existing   = getSubmissionByTaskId(taskId)
  const draftNumber = existing ? existing.draftNumber + 1 : 1
  const ext        = file.name.split('.').pop() || 'bin'
  const fileName   = `${taskName} - draft${draftNumber}.${ext}`

  // Upload to Drive: root / clientName / taskName /
  const rootId     = getRootFolderId()
  const clientDir  = await ensureFolder(clientName, rootId)
  const taskDir    = await ensureFolder(taskName, clientDir)

  const buffer = Buffer.from(await file.arrayBuffer())
  const { fileId, viewUrl } = await uploadFile(buffer, fileName, file.type || 'application/octet-stream', taskDir)

  const now          = new Date().toISOString()
  const submissionId = existing?.id || randomUUID()

  const submission = {
    id: submissionId, taskId, taskName,
    clientName, designerName: user.name,
    deliverableType: deliverableType as never,
    fileType: file.type,
    fileName, storagePath: fileId, viewUrl,
    draftNumber, status: 'pending' as const,
    designerNote, pmComment: '',
    submittedAt: now, reviewedAt: undefined, reviewedBy: undefined,
  }
  saveSubmission(submission)

  appendRevision({
    id: randomUUID(), taskId, taskName,
    clientName, designerName: user.name,
    draftNumber, storagePath: fileId, viewUrl,
    designerNote, pmComment: '', status: 'pending',
    submittedAt: now,
  })

  return NextResponse.json({ id: submissionId, viewUrl, draftNumber, fileName })
}

// PUT — PM reviews a submission
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { submissionId, status, pmComment } = await req.json()
  const subs = getSubmissions()
  const sub  = subs.find(s => s.id === submissionId)
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  updateSubmission(sub.taskId, { status, pmComment: pmComment || '', reviewedAt: now, reviewedBy: user.name })
  updateRevision(sub.taskId, sub.draftNumber, { pmComment: pmComment || '', status, reviewedAt: now, reviewedBy: user.name })

  if (status === 'approved') {
    const tasks   = getTasks()
    const task    = tasks.find(t => t.id === sub.taskId)
    saveApprovedFile({
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
    const allRevisions   = getRevisionsByTaskId(sub.taskId)
    const previousFileIds = allRevisions
      .filter(r => r.storagePath && r.storagePath !== sub.storagePath)
      .map(r => r.storagePath)
    for (const fid of previousFileIds) await deleteFile(fid)
  }

  if (status === 'rejected') {
    // Delete all draft files from Drive
    const allRevisions = getRevisionsByTaskId(sub.taskId)
    for (const r of allRevisions) if (r.storagePath) await deleteFile(r.storagePath)
  }

  return NextResponse.json({ ok: true })
}
