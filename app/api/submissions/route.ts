export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import {
  getSubmissions, saveSubmission, getSubmissionByTaskId, updateSubmission,
  appendRevision, updateRevision, getRevisionsByTaskId,
  getTasks, saveApprovedFile, getApprovedFiles,
} from '@/lib/store'
import { deleteAllDraftsExcept, deleteFile } from '@/lib/drive'
import { addAsanaComment, completeAsanaTask } from '@/lib/asana'
import { logActivity, incrementSOWApprovedCount } from '@/lib/sheets'
import { notifyPMNewSubmission, notifyDesignerReviewed } from '@/lib/notify'
import { randomUUID } from 'crypto'

// Designer email map — add emails here when available
const DESIGNER_EMAILS: Record<string, string> = {
  Anshu:   process.env.EMAIL_ANSHU   || '',
  Amit:    process.env.EMAIL_AMIT    || '',
  Ranjeet: process.env.EMAIL_RANJEET || '',
}

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

// POST — called after upload to Drive completes
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { taskId, taskName, clientName, deliverableType, designerNote, fileId, draftName, draftNumber } = body
  if (!taskId || !fileId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const viewUrl  = (body.viewUrl as string) || `https://drive.google.com/file/d/${fileId}/view`
  const now      = new Date().toISOString()
  const existing = await getSubmissionByTaskId(taskId)
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

  // Log to Activity Log
  await logActivity(
    user.name, 'Draft Submitted', taskName,
    `client: ${clientName}, draft #${draftNumber}, file: ${draftName}`,
    '', designerNote || ''
  )

  // Notify PM
  await notifyPMNewSubmission({
    designerName: user.name,
    taskName, clientName,
    draftNumber,
    designerNote: designerNote || '',
    viewUrl,
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

  // Log action with full detail
  const actionLabel =
    status === 'approved' ? 'Draft Approved' :
    status === 'rejected' ? 'Draft Rejected' :
    status === 'revision' ? 'Revision Requested' : `Status: ${status}`

  await logActivity(
    user.name, actionLabel, sub.taskName,
    `client: ${sub.clientName}, designer: ${sub.designerName}, draft #${sub.draftNumber}`,
    pmComment || '',
    sub.designerNote || ''
  )

  if (status === 'approved') {
    const tasks = await getTasks()
    const task  = tasks.find(t => t.id === sub.taskId)

    // Check if already approved — use task_id as stable key to prevent duplicate rows
    const existingApproved = await getApprovedFiles()
    const alreadyApproved = existingApproved.some(f => f.taskId === sub.taskId)

    await saveApprovedFile({
      id: sub.taskId, // Use taskId as stable ID so upsert always overwrites same row
      taskId: sub.taskId,
      taskName: sub.taskName, clientName: sub.clientName,
      designerName: sub.designerName,
      sowMonth: task?.sowMonth || '',
      deliverableType: task?.deliverableType || sub.deliverableType,
      storagePath: sub.storagePath, viewUrl: sub.viewUrl,
      totalDrafts: sub.draftNumber,
      approvedAt: now, approvedBy: user.name,
    })

    // Only increment SOW count on FIRST approval — not on re-approval after revision
    const taskData = tasks.find(t => t.id === sub.taskId)
    if (taskData?.clientId && !alreadyApproved) await incrementSOWApprovedCount(taskData.clientId)

    // Sync to Asana: add comment + mark complete
    if (taskData?.asanaGid) {
      addAsanaComment(taskData.asanaGid,
        `✅ Approved in Makers Studio by ${user.name} — Draft #${sub.draftNumber}`
      ).catch(() => {})
      completeAsanaTask(taskData.asanaGid).catch(() => {})
    }

    // Delete all draft files — keep only approved
    const allRevisions = await getRevisionsByTaskId(sub.taskId)
    const allFileIds = allRevisions.map(r => r.storagePath).filter(Boolean)
    await deleteAllDraftsExcept(allFileIds, sub.storagePath)
  }

  if (status === 'rejected') {
    // Sync to Asana: add rejection comment
    const rejectedTask = (await getTasks()).find(t => t.id === sub.taskId)
    if (rejectedTask?.asanaGid) {
      addAsanaComment(rejectedTask.asanaGid,
        `❌ Rejected in Makers Studio by ${user.name}${pmComment ? ': ' + pmComment : ''}`
      ).catch(() => {})
    }
    // Delete all draft files on rejection
    const allRevisions = await getRevisionsByTaskId(sub.taskId)
    const allFileIds = allRevisions.map(r => r.storagePath).filter(Boolean)
    for (const fid of allFileIds) {
      const { deleteFile } = await import('@/lib/drive')
      await deleteFile(fid)
    }
  }

  // Sync revision request to Asana
  if (status === 'revision') {
    const revTask = (await getTasks()).find(t => t.id === sub.taskId)
    if (revTask?.asanaGid) {
      addAsanaComment(revTask.asanaGid,
        `🔄 Revision requested by ${user.name} on Draft #${sub.draftNumber}${pmComment ? ': ' + pmComment : ''}`
      ).catch(() => {})
    }
  }

  // Notify designer
  const designerEmail = DESIGNER_EMAILS[sub.designerName]
  if (designerEmail) {
    await notifyDesignerReviewed({
      designerEmail,
      designerName: sub.designerName,
      taskName: sub.taskName,
      clientName: sub.clientName,
      draftNumber: sub.draftNumber,
      status: status as 'approved' | 'rejected' | 'revision',
      pmComment: pmComment || '',
      reviewedBy: user.name,
      viewUrl: sub.viewUrl,
    })
  }

  return NextResponse.json({ ok: true })
}
