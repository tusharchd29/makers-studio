import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSOW, saveSOWEntry } from '@/lib/store'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getSOW())
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entry = await req.json()
  saveSOWEntry(entry)
  return NextResponse.json(entry)
}
