export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getTasks, saveTask, deleteTask } from '@/lib/store'
import { syncImportToAsana, syncEditToAsana, createAsanaTask } from '@/lib/asana'
import { randomUUID } from 'crypto'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let tasks = await getTasks()
  if (user.role === 'designer') tasks = tasks.filter(t => t.assignedTo === user.name)
  return NextResponse.json(tasks)
}

// POST — import a task from Asana (body must include asanaGid + asanaProjectName)
// OR create a manual task (no asanaGid — legacy behaviour preserved)
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const task = {
    // Use Asana GID as ID when importing — guarantees stable dedup key
    id:              body.asanaGid || randomUUID(),
    clientId:        body.clientId,
    clientName:      body.clientName,
    name:            body.name,
    deliverableType: body.deliverableType,
    assignedTo:      body.assignedTo,
    deadline:        body.deadline,
    brief:           body.brief || '',
    createdAt:       new Date().toISOString(),
    createdBy:       user.name,
    sowMonth:        body.sowMonth || '',
    asanaGid:        body.asanaGid || undefined,
  }

  // 1. Save to Makers Studio Sheet first — always succeeds independently
  await saveTask(task, true)

  // 2. Asana sync
  let asanaSynced = false

  if (task.asanaGid) {
    // Imported from Asana — sync back details
    try {
      await Promise.race([
        syncImportToAsana({
          taskGid:         task.asanaGid,
          designerName:    task.assignedTo,
          deliverableType: task.deliverableType,
          sowMonth:        task.sowMonth,
          brief:           task.brief,
          pmName:          user.name,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      asanaSynced = true
    } catch { asanaSynced = false }

  } else if (body.asanaProjectGid) {
    // Manual task — create in Asana and store the returned GID
    try {
      const newGid = await Promise.race([
        createAsanaTask({
          name:            task.name,
          projectGid:      body.asanaProjectGid,
          designerName:    task.assignedTo,
          deliverableType: task.deliverableType,
          sowMonth:        task.sowMonth,
          brief:           task.brief,
          deadline:        task.deadline ? task.deadline.split('T')[0] : '',
          clientName:      task.clientName,
          pmName:          user.name,
        }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]) as string | null

      if (newGid) {
        task.asanaGid = newGid
        // Re-save with asanaGid now set
        await saveTask(task)
        asanaSynced = true
      }
    } catch { asanaSynced = false }
  }

  return NextResponse.json({ ...task, asanaSynced })
}

// PUT — PM edits an existing task (assigned designer, brief, deliverable type etc.)
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  // 1. Save to Sheet
  await saveTask(body)

  // 2. Await Asana sync (with timeout) — return asanaSynced flag
  let asanaSynced = false
  if (body.asanaGid) {
    try {
      await Promise.race([
        syncEditToAsana({
          taskGid:         body.asanaGid,
          designerName:    body.assignedTo,
          deliverableType: body.deliverableType,
          sowMonth:        body.sowMonth || '',
          brief:           body.brief   || '',
          pmName:          user.name,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      asanaSynced = true
    } catch { asanaSynced = false }
  }

  return NextResponse.json({ ...body, asanaSynced })
}

// PATCH — designer updates task status OR pm updates pmStatus / reopens task
export async function PATCH(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const tasks = await getTasks()
  const task = tasks.find(t => t.id === body.id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { logAudit } = await import('@/lib/sheets')

  // Designer: update taskStatus + holdReason
  if (user.role === 'designer') {
    if (task.assignedTo !== user.name) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const oldStatus = task.taskStatus || 'not-started'
    const updated = { ...task, taskStatus: body.taskStatus, holdReason: body.holdReason || '' }
    await saveTask(updated)

    await logAudit({
      user: user.name, role: 'designer',
      action: 'Task Status Changed',
      taskId: task.id, taskName: task.name, clientName: task.clientName,
      oldValue: oldStatus,
      newValue: body.taskStatus,
      detail: body.taskStatus === 'hold' ? `Hold reason: ${body.holdReason}` : '',
    })

    if (body.taskStatus === 'hold' && body.holdReason) {
      const { notifyPMOnHold } = await import('@/lib/notify')
      await notifyPMOnHold({
        designerName: user.name,
        taskName: task.name,
        clientName: task.clientName,
        holdReason: body.holdReason,
      })
    }
    return NextResponse.json({ ok: true, task: updated })
  }

  // PM: update priority, pmNotes, pmStatus, OR reopen task
  if (user.role === 'pm') {
    const updated = {
      ...task,
      priority:   body.priority   !== undefined ? body.priority   : task.priority,
      pmNotes:    body.pmNotes    !== undefined ? body.pmNotes    : task.pmNotes,
      pmStatus:   body.pmStatus   !== undefined ? body.pmStatus   : task.pmStatus,
      assignedTo: body.reopen && body.assignedTo ? body.assignedTo : task.assignedTo,
      // PM can reopen: reset taskStatus back to processing, clear pmStatus
      taskStatus: body.reopen ? 'processing' as const : task.taskStatus,
      ...(body.reopen ? { pmStatus: undefined, postingId: undefined } : {}),
      postingId: body.reopen ? undefined : task.postingId,
    }

    // Log reopen
    if (body.reopen) {
      await logAudit({
        user: user.name, role: 'pm',
        action: 'Task Reopened',
        taskId: task.id, taskName: task.name, clientName: task.clientName,
        oldValue: task.taskStatus || 'done',
        newValue: 'processing',
        detail: body.assignedTo && body.assignedTo !== task.assignedTo
          ? `Reassigned: ${task.assignedTo} → ${body.assignedTo}`
          : `Kept assigned to ${task.assignedTo}`,
      })
      // Notify designer they have a reopened/reassigned task
      const newAssignee = body.assignedTo || task.assignedTo
      const DESIGNER_EMAILS: Record<string, string> = {
        Anshu:    process.env.EMAIL_ANSHU    || 'tusharchd29@gmail.com',
        Amit:     process.env.EMAIL_AMIT     || 'tusharchd29@gmail.com',
        Ranjeet:  process.env.EMAIL_RANJEET  || 'tusharchd29@gmail.com',
        Himanshu: process.env.EMAIL_HIMANSHU || 'tusharchd29@gmail.com',
      }
      const designerEmail = DESIGNER_EMAILS[newAssignee]
      if (designerEmail) {
        const { notifyDesignerReopened } = await import('@/lib/notify')
        await notifyDesignerReopened({
          designerEmail,
          designerName: newAssignee,
          taskName: task.name,
          clientName: task.clientName,
          reassignedFrom: task.assignedTo,
          pmName: user.name,
        })
      }
      const { updateSubmission, getSubmissionByTaskId } = await import('@/lib/store')
      const existingSub = await getSubmissionByTaskId(task.id)
      if (existingSub) {
        await updateSubmission(task.id, { status: 'revision' as never, pmComment: 'Task reopened by PM — please resubmit.', reviewedAt: new Date().toISOString(), reviewedBy: user.name })
      }
    }

    // Log pmStatus change
    if (body.pmStatus && body.pmStatus !== task.pmStatus) {
      await logAudit({
        user: user.name, role: 'pm',
        action: 'PM Status Changed',
        taskId: task.id, taskName: task.name, clientName: task.clientName,
        oldValue: task.pmStatus || 'none',
        newValue: body.pmStatus,
        detail: body.pmStatus === 'ready-to-post' ? 'Queued for Postings app' : 'Marked as posted',
      })
    }

    // Auto-create in Postings app when PM marks ready-to-post
    if (body.pmStatus === 'ready-to-post' && !task.postingId) {
      try {
        const postingsUrl = process.env.POSTINGS_APP_URL || 'https://postings-topaz.vercel.app'
        const res = await fetch(`${postingsUrl}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client:    task.clientName,
            type:      task.deliverableType,
            date:      task.deadline ? task.deadline.split('T')[0] : '',
            time:      '',
            title:     task.name,
            caption:   task.brief || '',
            asset:     '',
            remarks:   `Auto-created from Makers Studio. Assigned: ${task.assignedTo}. SOW Month: ${task.sowMonth}`,
            platforms: ['Instagram'],
          }),
        })
        const data = await res.json()
        if (data.ok && data.id) updated.postingId = data.id
      } catch { /* don't block if Postings is down */ }
    }

    await saveTask(updated)
    return NextResponse.json({ ok: true, task: updated })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteTask(id)
  return NextResponse.json({ ok: true })
}
