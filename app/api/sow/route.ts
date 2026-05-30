import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSOWFromSheet, saveSOWToSheet } from '@/lib/drive'

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
  return NextResponse.json(await getSOWFromSheet())
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entry = await req.json()
  if (HAS_DRIVE) await saveSOWToSheet(entry)
  return NextResponse.json(entry)
}
