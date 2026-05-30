import { NextRequest, NextResponse } from 'next/server'
import { verifyPin, createSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { name, pin } = await req.json()
  const user = verifyPin(name, pin)
  if (!user) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }
  const token = await createSession(user)
  const res = NextResponse.json({ user })
  res.cookies.set('ms_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('ms_session')
  return res
}
