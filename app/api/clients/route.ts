import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getClientsFromSheet, saveClientToSheet, deleteClientFromSheet } from '@/lib/drive'
import { Client } from '@/lib/types'
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
  return NextResponse.json(await getClientsFromSheet())
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await req.json()
  const client: Client = { id: randomUUID(), name }
  if (HAS_DRIVE) await saveClientToSheet(client)
  return NextResponse.json(client)
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const client: Client = await req.json()
  if (HAS_DRIVE) await saveClientToSheet(client)
  return NextResponse.json(client)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (HAS_DRIVE) await deleteClientFromSheet(id)
  return NextResponse.json({ ok: true })
}
