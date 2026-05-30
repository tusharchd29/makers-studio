import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getTasksFromSheet, saveTaskToSheet, deleteTaskFromSheet } from '@/lib/drive'
import { Task } from '@/lib/types'
import { randomUUID } from 'crypto'

const HAS_DRIVE = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!HAS_DRIVE) return NextResponse.json([])
  const tasks = await getTasksFromSheet()
  if (user.role === 'designer') return NextResponse.json(tasks.filter(t => t.assignedTo === user.name))
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const task: Task = {
    id: randomUUID(), clientId: body.clientId, clientName: body.clientName,
    name: body.name, deliverableType: body.deliverableType, assignedTo: body.assignedTo,
    deadline: body.deadline, brief: body.brief || '', createdAt: new Date().toISOString(), createdBy: user.name,
  }
  if (HAS_DRIVE) await saveTaskToSheet(task)
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const task: Task = await req.json()
  if (HAS_DRIVE) await saveTaskToSheet(task)
  return NextResponse.json(task)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (HAS_DRIVE) await deleteTaskFromSheet(id)
  return NextResponse.json({ ok: true })
}
