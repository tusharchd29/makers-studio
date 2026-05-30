export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const taskId    = searchParams.get('taskId')
  const clientName = searchParams.get('client')
  const month     = searchParams.get('month')

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  let query = db.from('makers_studio_revisions').select('*').order('submitted_at', { ascending: true })
  if (taskId)     query = query.eq('task_id', taskId)
  if (clientName) query = query.eq('client_name', clientName)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []).map((r: Record<string, unknown>) => ({
    taskName: r.task_name, clientName: r.client_name, designerName: r.designer_name,
    draftNumber: r.draft_number, status: r.status,
    designerNote: r.designer_note || '', pmComment: r.pm_comment || '',
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at || '',
    reviewedBy: r.reviewed_by || '', viewUrl: r.view_url,
  }))

  // Filter by month if needed
  const filtered = month
    ? rows.filter(r => new Date(r.submittedAt as string).toLocaleString('en-US', { month: 'long', year: 'numeric' }) === month)
    : rows

  return NextResponse.json(filtered)
}
