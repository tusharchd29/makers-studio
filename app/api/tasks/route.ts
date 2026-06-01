export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getTasks, saveTask, deleteTask } from '@/lib/store'
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

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const task = {
    id: randomUUID(),
    clientId: body.clientId, clientName: body.clientName,
    name: body.name, deliverableType: body.deliverableType,
    assignedTo: body.assignedTo, deadline: body.deadline,
    brief: body.brief || '', createdAt: new Date().toISOString(),
    createdBy: user.name, sowMonth: body.sowMonth || '',
  }
  await saveTask(task)
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  await saveTask(body)
  return NextResponse.json(body)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteTask(id)
  return NextResponse.json({ ok: true })
}
