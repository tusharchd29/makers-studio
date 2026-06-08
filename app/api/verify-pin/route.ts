export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pin } = await req.json()
  const correct = process.env.SOW_PIN || '11111'
  return NextResponse.json({ ok: pin === correct })
}

