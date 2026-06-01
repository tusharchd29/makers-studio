export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getApprovedFiles } from '@/lib/store'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month      = searchParams.get('month')
  const clientName = searchParams.get('client')

  let files = await getApprovedFiles()
  if (month)      files = files.filter(f => f.sowMonth === month)
  if (clientName) files = files.filter(f => f.clientName === clientName)
  return NextResponse.json(files)
}
