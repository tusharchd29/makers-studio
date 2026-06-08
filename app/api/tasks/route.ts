export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getTasks, saveTask, deleteTask } from '@/lib/store'
import { syncImportToAsana, syncEditToAsana } from '@/lib/asana'
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
  await saveTask(task)

  // 2. Fire-and-forget: sync back to Asana if this is an Asana import
  if (task.asanaGid) {
    syncImportToAsana({
      taskGid:         task.asanaGid,
      designerName:    task.assignedTo,
      deliverableType: task.deliverableType,
      sowMonth:        task.sowMonth,
      brief:           task.brief,
      pmName:          user.name,
    }).catch(() => { /* never block — Asana sync failure is silent */ })
  }

  return NextResponse.json(task)
}

// PUT — PM edits an existing task (assigned designer, brief, deliverable type etc.)
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  // 1. Save to Sheet
  await saveTask(body)

  // 2. Fire-and-forget: sync back to Asana if task has an asanaGid
  if (body.asanaGid) {
    syncEditToAsana({
      taskGid:         body.asanaGid,
      designerName:    body.assignedTo,
      deliverableType: body.deliverableType,
      sowMonth:        body.sowMonth || '',
      brief:           body.brief   || '',
      pmName:          user.name,
    }).catch(() => { /* never block */ })
  }

  return NextResponse.json(body)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteTask(id)
  return NextResponse.json({ ok: true })
}
