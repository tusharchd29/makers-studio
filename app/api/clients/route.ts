import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getClients, saveClient, deleteClient } from '@/lib/store'
import { Client } from '@/lib/types'
import { randomUUID } from 'crypto'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getClients())
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await req.json()
  const client: Client = { id: randomUUID(), name }
  saveClient(client)
  return NextResponse.json(client)
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const client: Client = await req.json()
  saveClient(client)
  return NextResponse.json(client)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  deleteClient(id)
  return NextResponse.json({ ok: true })
}
