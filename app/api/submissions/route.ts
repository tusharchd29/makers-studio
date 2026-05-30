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

// POST — new draft submission (one active draft per task at a time)
export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { taskId, taskName, clientId, deliverableType, checklist, notes: designerNote, storagePath, fileName, fileType, version } = body

  if (!storagePath || !taskId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  const { data: clientData } = await db.from('makers_studio_clients').select('name').eq('id', clientId).single()
  if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

  // Get existing submission row for this task
  const { data: existing } = await db.from('makers_studio_submissions')
    .select('id, draft_number').eq('task_id', taskId).single()

  const draftNumber = version || (existing ? (existing.draft_number as number) + 1 : 1)

  // Generate signed view URL (10 years)
  const { data: signedData, error: signErr } = await db.storage
    .from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
  if (signErr || !signedData) return NextResponse.json({ error: `Signed URL failed: ${signErr?.message}` }, { status: 500 })

  const viewUrl = signedData.signedUrl
  const submissionId = existing?.id as string || randomUUID()
  const now = new Date().toISOString()

  // Upsert single submission row (one per task — always latest draft)
  const { error: upsertErr } = await db.from('makers_studio_submissions').upsert({
    id: submissionId, task_id: taskId, task_name: taskName,
    client_name: clientData.name, designer_name: user.name,
    deliverable_type: deliverableType, file_type: fileType,
    file_name: fileName, storage_path: storagePath,
    view_url: viewUrl, draft_number: draftNumber,
    status: 'pending', designer_note: designerNote || '',
    pm_comment: '', submitted_at: now,
    reviewed_at: null, reviewed_by: '',
  })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Append to revision log (append-only — full history for Excel export)
  await db.from('makers_studio_revisions').insert({
    id: randomUUID(), task_id: taskId, task_name: taskName,
    client_name: clientData.name, designer_name: user.name,
    draft_number: draftNumber, storage_path: storagePath,
    view_url: viewUrl, designer_note: designerNote || '',
    pm_comment: '', status: 'pending', submitted_at: now,
  })

  return NextResponse.json({ id: submissionId, viewUrl, storagePath, draftNumber, fileName })
}

// PUT — PM review action
export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { submissionId, status, pmComment } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  const { data: sub } = await db.from('makers_studio_submissions').select('*').eq('id', submissionId).single()
  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()

  // Update submission status + PM comment
  await db.from('makers_studio_submissions').update({
    status, pm_comment: pmComment || '',
    reviewed_at: now, reviewed_by: user.name,
  }).eq('id', submissionId)

  // Update revision log for this specific draft
  await db.from('makers_studio_revisions').update({
    pm_comment: pmComment || '', status, reviewed_at: now, reviewed_by: user.name,
  }).eq('task_id', sub.task_id).eq('draft_number', sub.draft_number)

  if (status === 'approved') {
    // Save to approved_files permanently
    const { data: taskData } = await db.from('makers_studio_tasks')
      .select('sow_month, deliverable_type').eq('id', sub.task_id).single()

    await db.from('makers_studio_approved_files').upsert({
      id: randomUUID(), task_id: sub.task_id,
      task_name: sub.task_name, client_name: sub.client_name,
      designer_name: sub.designer_name,
      sow_month: taskData?.sow_month || now.slice(0, 7),
      deliverable_type: taskData?.deliverable_type || sub.deliverable_type,
      storage_path: sub.storage_path, view_url: sub.view_url,
      total_drafts: sub.draft_number,
      approved_at: now, approved_by: user.name,
    }, { onConflict: 'task_id' })

    // Delete all PREVIOUS draft files — keep only the approved (current) one
    const { data: allDrafts } = await db.from('makers_studio_revisions')
      .select('storage_path, draft_number').eq('task_id', sub.task_id)

    if (allDrafts && allDrafts.length > 0) {
      const currentPath = sub.storage_path as string
      const oldPaths = allDrafts
        .map((d: Record<string, unknown>) => d.storage_path as string)
        .filter(p => p && p !== currentPath) // keep the approved file, delete old drafts

      if (oldPaths.length > 0) {
        await db.storage.from(BUCKET).remove(oldPaths)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
