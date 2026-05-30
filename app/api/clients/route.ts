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

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { data, error } = await db.from('makers_studio_clients').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const client = { id: randomUUID(), name, storage_folder: '' }
  const { error } = await db.from('makers_studio_clients').insert(client)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(client)
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const client = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_clients').upsert(client)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(client)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
