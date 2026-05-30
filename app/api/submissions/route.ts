export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { randomUUID } from 'crypto'

const BUCKET = 'makers-studio'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  let query = db.from('makers_studio_submissions').select('*').order('submitted_at', { ascending: false })
  if (user.role === 'designer') query = query.eq('designer_name', user.name)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map((r: Record<string, unknown>) => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    deliverableType: r.deliverable_type, fileType: r.file_type,
    fileName: r.file_name, storagePath: r.storage_path,
    viewUrl: r.view_url, version: r.version, status: r.status,
    pmComment: r.pm_comment, checklist: r.checklist, notes: r.notes,
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by,
  })))
}

// POST — receives only metadata after browser has already uploaded file directly to Supabase
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { taskId, taskName, clientId, deliverableType, checklist, notes, storagePath, fileName, fileType, version } = body

  if (!storagePath || !taskId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  // Get client name
  const { data: clientData } = await db.from('makers_studio_clients').select('name').eq('id', clientId).single()
  if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

  // Generate a long-lived signed view URL (10 years)
  const { data: signedData, error: signErr } = await db.storage
    .from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
  if (signErr || !signedData) return NextResponse.json({ error: `Signed URL failed: ${signErr?.message}` }, { status: 500 })

  const submissionId = randomUUID()
  const { error: insertErr } = await db.from('makers_studio_submissions').insert({
    id: submissionId, task_id: taskId, task_name: taskName,
    client_name: clientData.name, designer_name: user.name,
    deliverable_type: deliverableType, file_type: fileType,
    file_name: fileName, storage_path: storagePath,
    view_url: signedData.signedUrl, version,
    status: 'pending', pm_comment: '',
    checklist: Array.isArray(checklist) ? checklist.join(', ') : (checklist || ''),
    notes: notes || '', submitted_at: new Date().toISOString(),
  })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ id: submissionId, viewUrl: signedData.signedUrl, storagePath, version, fileName })
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_submissions').update({
    status, pm_comment: pmComment || '',
    reviewed_at: new Date().toISOString(), reviewed_by: user.name,
  }).eq('id', submissionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
