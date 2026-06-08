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

  // Deduplicate by taskId — keep the latest entry (highest totalDrafts = most recent approval)
  const seen = new Map<string, typeof files[0]>()
  for (const f of files) {
    const key = f.taskId || f.taskName // fallback to taskName if taskId missing
    const existing = seen.get(key)
    if (!existing || Number(f.totalDrafts) >= Number(existing.totalDrafts)) {
      seen.set(key, f)
    }
  }
  files = [...seen.values()]

  if (month)      files = files.filter(f => f.sowMonth === month)
  if (clientName) files = files.filter(f => f.clientName === clientName)
  return NextResponse.json(files)
}
