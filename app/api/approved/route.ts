export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month      = searchParams.get('month')
  const clientName = searchParams.get('client')

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  let query = db.from('makers_studio_approved_files').select('*').order('approved_at', { ascending: false })
  if (month)      query = query.eq('sow_month', month)
  if (clientName) query = query.eq('client_name', clientName)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data || []).map((r: Record<string, unknown>) => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    sowMonth: r.sow_month, deliverableType: r.deliverable_type,
    storagePath: r.storage_path, viewUrl: r.view_url,
    totalDrafts: r.total_drafts,
    approvedAt: r.approved_at, approvedBy: r.approved_by,
  })))
}
