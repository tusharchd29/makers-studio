export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getRevisions } from '@/lib/store'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const taskId     = searchParams.get('taskId')
  const clientName = searchParams.get('client')
  const month      = searchParams.get('month')

  let revisions = await getRevisions()
  if (taskId)     revisions = revisions.filter(r => r.taskId === taskId)
  if (clientName) revisions = revisions.filter(r => r.clientName === clientName)
  if (month)      revisions = revisions.filter(r =>
    new Date(r.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' }) === month
  )
  return NextResponse.json(revisions)
}
