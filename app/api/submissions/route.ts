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

function toFrontend(r: Record<string, unknown>) {
  return {
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    deliverableType: r.deliverable_type, fileType: r.file_type,
    fileName: r.file_name, storagePath: r.storage_path,
    viewUrl: r.view_url, draftNumber: r.draft_number || 1,
    status: r.status, designerNote: r.designer_note || '',
    pmComment: r.pm_comment || '',
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by,
  }
}

// GET — latest submission per task for current user
export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  let query = db.from('makers_studio_submissions').select('*').order('submitted_at', { ascending: false })
  if (user.role === 'designer') query = query.eq('designer_name', user.name)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(toFrontend))
}

// POST — new draft: overwrites previous draft file in storage, upserts submission row, appends revision log
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { taskId, taskName, clientId, deliverableType, checklist, notes: designerNote, storagePath, fileName, fileType } = body

  if (!storagePath || !taskId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  // Get client + task info
  const { data: clientData } = await db.from('makers_studio_clients').select('name').eq('id', clientId).single()
  if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

  // Get existing submission for this task to determine draft number
  const { data: existing } = await db.from('makers_studio_submissions').select('id, draft_number, storage_path').eq('task_id', taskId).single()
  const draftNumber = existing ? (existing.draft_number as number) + 1 : 1

  // If resubmit — delete old draft from storage (save space, keep only latest)
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await db.storage.from(BUCKET).remove([existing.storage_path as string])
  }

  // Generate signed view URL (10 years)
  const { data: signedData, error: signErr } = await db.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
  if (signErr || !signedData) return NextResponse.json({ error: `Signed URL failed: ${signErr?.message}` }, { status: 500 })

  const viewUrl = signedData.signedUrl

  // Upsert submission (one row per task — latest draft)
  const submissionId = existing?.id as string || randomUUID()
  const { error: upsertErr } = await db.from('makers_studio_submissions').upsert({
    id: submissionId, task_id: taskId, task_name: taskName,
    client_name: clientData.name, designer_name: user.name,
    deliverable_type: deliverableType, file_type: fileType,
    file_name: fileName, storage_path: storagePath,
    view_url: viewUrl, draft_number: draftNumber,
    status: 'pending', designer_note: designerNote || '',
    pm_comment: '', submitted_at: new Date().toISOString(),
    reviewed_at: null, reviewed_by: '',
  })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Append to revision log (append-only for Excel export)
  await db.from('makers_studio_revisions').insert({
    id: randomUUID(), task_id: taskId, task_name: taskName,
    client_name: clientData.name, designer_name: user.name,
    draft_number: draftNumber, storage_path: storagePath,
    view_url: viewUrl, designer_note: designerNote || '',
    pm_comment: '', status: 'pending',
    submitted_at: new Date().toISOString(),
  })

  return NextResponse.json({ id: submissionId, viewUrl, storagePath, draftNumber, fileName })
}

// PUT — PM reviews: approve moves to approved_files + logs to revisions; revision/reject just updates status
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { submissionId, status, pmComment } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  // Get submission
  const { data: sub } = await db.from('makers_studio_submissions').select('*').eq('id', submissionId).single()
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()

  // Update submission status
  await db.from('makers_studio_submissions').update({
    status, pm_comment: pmComment || '',
    reviewed_at: now, reviewed_by: user.name,
  }).eq('id', submissionId)

  // Update revision log entry for this draft
  await db.from('makers_studio_revisions').update({
    pm_comment: pmComment || '', status, reviewed_at: now, reviewed_by: user.name,
  }).eq('task_id', sub.task_id).eq('draft_number', sub.draft_number)

  // If approved — move to approved_files (permanent record)
  if (status === 'approved') {
    // Get task's sow_month
    const { data: taskData } = await db.from('makers_studio_tasks').select('sow_month, deliverable_type').eq('id', sub.task_id).single()

    await db.from('makers_studio_approved_files').upsert({
      id: randomUUID(),
      task_id: sub.task_id,
      task_name: sub.task_name,
      client_name: sub.client_name,
      designer_name: sub.designer_name,
      sow_month: taskData?.sow_month || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      deliverable_type: taskData?.deliverable_type || sub.deliverable_type,
      storage_path: sub.storage_path,
      view_url: sub.view_url,
      total_drafts: sub.draft_number,
      approved_at: now,
      approved_by: user.name,
    }, { onConflict: 'task_id' })
  }

  return NextResponse.json({ ok: true })
}
