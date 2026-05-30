export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { randomUUID } from 'crypto'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

function toFrontend(r: Record<string, unknown>) {
  return {
    id: r.id, clientId: r.client_id, clientName: r.client_name,
    name: r.name, deliverableType: r.deliverable_type,
    assignedTo: r.assigned_to, deadline: r.deadline,
    brief: r.brief || '', createdAt: r.created_at, createdBy: r.created_by,
    sowMonth: r.sow_month || '',
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  let query = db.from('makers_studio_tasks').select('*').order('created_at', { ascending: false })
  if (user.role === 'designer') query = query.eq('assigned_to', user.name)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(toFrontend))
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const task = {
    id: randomUUID(), client_id: body.clientId, client_name: body.clientName,
    name: body.name, deliverable_type: body.deliverableType,
    assigned_to: body.assignedTo, deadline: body.deadline,
    brief: body.brief || '', created_at: new Date().toISOString(),
    created_by: user.name, sow_month: body.sowMonth || '',
  }
  const { error } = await db.from('makers_studio_tasks').insert(task)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toFrontend(task))
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const task = {
    id: body.id, client_id: body.clientId, client_name: body.clientName,
    name: body.name, deliverable_type: body.deliverableType,
    assigned_to: body.assignedTo, deadline: body.deadline,
    brief: body.brief || '', created_at: body.createdAt,
    created_by: body.createdBy, sow_month: body.sowMonth || '',
  }
  const { error } = await db.from('makers_studio_tasks').upsert(task)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toFrontend(task))
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
