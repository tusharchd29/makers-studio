// ── Supabase-backed data store ────────────────────────────────────────────
import { getSupabase } from './supabase'
import { logActivity } from './sheets'
import { Task, SOWEntry, Client, Submission, RevisionEntry, ApprovedFile, CLIENTS } from './types'
import { SEEDED_SOW } from './seedSOW'

// ── Clients ───────────────────────────────────────────────────────────────
export async function getClients(): Promise<Client[]> {
  const sb = getSupabase()
  const { data } = await sb.from('clients').select('*').order('name')
  if (!data || data.length === 0) {
    await sb.from('clients').upsert(CLIENTS.map(c => ({ id: c.id, name: c.name })), { onConflict: 'id' })
    return CLIENTS
  }
  return data.map(r => ({ id: r.id, name: r.name }))
}

export async function saveClient(client: Client, by = 'PM') {
  const sb = getSupabase()
  await sb.from('clients').upsert({ id: client.id, name: client.name }, { onConflict: 'id' })
  await logActivity(by, 'Client Saved', client.name, `id: ${client.id}`)
}

export async function deleteClient(id: string, by = 'PM') {
  const sb = getSupabase()
  await sb.from('clients').delete().eq('id', id)
  await logActivity(by, 'Client Deleted', id, '')
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export async function getTasks(): Promise<Task[]> {
  const sb = getSupabase()
  const { data } = await sb.from('tasks').select('*').order('created_at', { ascending: false })
  if (!data) return []
  return data.map(r => ({
    id: r.id, clientId: r.client_id, clientName: r.client_name,
    name: r.name, deliverableType: r.deliverable_type,
    assignedTo: r.assigned_to, deadline: r.deadline,
    brief: r.brief, createdAt: r.created_at,
    createdBy: r.created_by, sowMonth: r.sow_month,
  }))
}

export async function saveTask(task: Task) {
  const sb = getSupabase()
  await sb.from('tasks').upsert({
    id: task.id, client_id: task.clientId, client_name: task.clientName,
    name: task.name, deliverable_type: task.deliverableType,
    assigned_to: task.assignedTo, deadline: task.deadline,
    brief: task.brief || '', created_at: task.createdAt,
    created_by: task.createdBy, sow_month: task.sowMonth || '',
  }, { onConflict: 'id' })
  await logActivity(
    task.createdBy || 'PM', 'Task Created', task.name,
    `client: ${task.clientName}, assigned: ${task.assignedTo}, deadline: ${task.deadline}`
  )
}

export async function deleteTask(id: string, by = 'PM') {
  const sb = getSupabase()
  await sb.from('tasks').delete().eq('id', id)
  await logActivity(by, 'Task Deleted', id, '')
}

// ── SOW ───────────────────────────────────────────────────────────────────
export async function getSOW(): Promise<SOWEntry[]> {
  const sb = getSupabase()
  const { data } = await sb.from('sow').select('*')
  if (!data || data.length === 0) {
    await sb.from('sow').upsert(SEEDED_SOW.map(e => ({
      client_id: e.clientId, service_type: e.serviceType,
      total_creatives: e.totalCreatives, priority: e.priority,
      status: e.status, reels: e.reels, stories: e.stories,
      statics: e.statics, videos: e.videos, photos: e.photos,
      carousels: e.carousels, youtube_shorts: e.youtubeShorts,
      approved_count: 0,
    })), { onConflict: 'client_id' })
    return SEEDED_SOW
  }
  return data.map(r => ({
    clientId: r.client_id, serviceType: r.service_type,
    totalCreatives: r.total_creatives, priority: r.priority,
    status: r.status, reels: r.reels, stories: r.stories,
    statics: r.statics, videos: r.videos, photos: r.photos,
    carousels: r.carousels, youtubeShorts: r.youtube_shorts,
    approvedCount: r.approved_count || 0,
  }))
}

export async function saveSOWEntry(entry: SOWEntry, by = 'PM') {
  const sb = getSupabase()
  await sb.from('sow').upsert({
    client_id: entry.clientId, service_type: entry.serviceType,
    total_creatives: entry.totalCreatives, priority: entry.priority,
    status: entry.status, reels: entry.reels, stories: entry.stories,
    statics: entry.statics, videos: entry.videos, photos: entry.photos,
    carousels: entry.carousels, youtube_shorts: entry.youtubeShorts,
  }, { onConflict: 'client_id' })
  await logActivity(by, 'SOW Updated', entry.clientId, `service: ${entry.serviceType}, total: ${entry.totalCreatives}`)
}

// ── Submissions ───────────────────────────────────────────────────────────
export async function getSubmissions(): Promise<Submission[]> {
  const sb = getSupabase()
  const { data } = await sb.from('submissions').select('*').order('submitted_at', { ascending: false })
  if (!data) return []
  return data.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    deliverableType: r.deliverable_type, fileType: r.file_type || '',
    fileName: r.file_name, storagePath: r.storage_path, viewUrl: r.view_url,
    draftNumber: r.draft_number, status: r.status,
    designerNote: r.designer_note || '', pmComment: r.pm_comment || '',
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at || undefined,
    reviewedBy: r.reviewed_by || undefined,
  }))
}

export async function saveSubmission(sub: Submission) {
  const sb = getSupabase()
  await sb.from('submissions').upsert({
    id: sub.id, task_id: sub.taskId, task_name: sub.taskName,
    client_name: sub.clientName, designer_name: sub.designerName,
    deliverable_type: sub.deliverableType, file_type: sub.fileType,
    file_name: sub.fileName, storage_path: sub.storagePath, view_url: sub.viewUrl,
    draft_number: sub.draftNumber, status: sub.status,
    designer_note: sub.designerNote, pm_comment: sub.pmComment || '',
    submitted_at: sub.submittedAt, reviewed_at: sub.reviewedAt || null,
    reviewed_by: sub.reviewedBy || null,
  }, { onConflict: 'task_id' })
}

export async function getSubmissionByTaskId(taskId: string): Promise<Submission | undefined> {
  const sb = getSupabase()
  const { data } = await sb.from('submissions').select('*').eq('task_id', taskId).single()
  if (!data) return undefined
  return {
    id: data.id, taskId: data.task_id, taskName: data.task_name,
    clientName: data.client_name, designerName: data.designer_name,
    deliverableType: data.deliverable_type, fileType: data.file_type || '',
    fileName: data.file_name, storagePath: data.storage_path, viewUrl: data.view_url,
    draftNumber: data.draft_number, status: data.status,
    designerNote: data.designer_note || '', pmComment: data.pm_comment || '',
    submittedAt: data.submitted_at, reviewedAt: data.reviewed_at || undefined,
    reviewedBy: data.reviewed_by || undefined,
  }
}

export async function updateSubmission(taskId: string, patch: Partial<Submission>) {
  const sb = getSupabase()
  const mapped: Record<string, unknown> = {}
  if (patch.status       !== undefined) mapped.status        = patch.status
  if (patch.pmComment    !== undefined) mapped.pm_comment    = patch.pmComment
  if (patch.reviewedAt   !== undefined) mapped.reviewed_at   = patch.reviewedAt
  if (patch.reviewedBy   !== undefined) mapped.reviewed_by   = patch.reviewedBy
  if (patch.draftNumber  !== undefined) mapped.draft_number  = patch.draftNumber
  if (patch.storagePath  !== undefined) mapped.storage_path  = patch.storagePath
  if (patch.viewUrl      !== undefined) mapped.view_url      = patch.viewUrl
  if (patch.fileName     !== undefined) mapped.file_name     = patch.fileName
  if (patch.designerNote !== undefined) mapped.designer_note = patch.designerNote
  if (patch.submittedAt  !== undefined) mapped.submitted_at  = patch.submittedAt
  await sb.from('submissions').update(mapped).eq('task_id', taskId)
}

// ── Revisions ─────────────────────────────────────────────────────────────
export async function getRevisions(): Promise<RevisionEntry[]> {
  const sb = getSupabase()
  const { data } = await sb.from('revisions').select('*').order('submitted_at', { ascending: true })
  if (!data) return []
  return data.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    draftNumber: r.draft_number, storagePath: r.storage_path, viewUrl: r.view_url,
    designerNote: r.designer_note || '', pmComment: r.pm_comment || '',
    status: r.status, submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at || undefined, reviewedBy: r.reviewed_by || undefined,
  }))
}

export async function appendRevision(rev: RevisionEntry) {
  const sb = getSupabase()
  await sb.from('revisions').insert({
    id: rev.id, task_id: rev.taskId, task_name: rev.taskName,
    client_name: rev.clientName, designer_name: rev.designerName,
    draft_number: rev.draftNumber, storage_path: rev.storagePath, view_url: rev.viewUrl,
    designer_note: rev.designerNote, pm_comment: rev.pmComment || '',
    status: rev.status, submitted_at: rev.submittedAt,
    reviewed_at: rev.reviewedAt || null, reviewed_by: rev.reviewedBy || null,
  })
}

export async function updateRevision(taskId: string, draftNumber: number, patch: Partial<RevisionEntry>) {
  const sb = getSupabase()
  const mapped: Record<string, unknown> = {}
  if (patch.status      !== undefined) mapped.status      = patch.status
  if (patch.pmComment   !== undefined) mapped.pm_comment  = patch.pmComment
  if (patch.reviewedAt  !== undefined) mapped.reviewed_at = patch.reviewedAt
  if (patch.reviewedBy  !== undefined) mapped.reviewed_by = patch.reviewedBy
  await sb.from('revisions').update(mapped).eq('task_id', taskId).eq('draft_number', draftNumber)
}

export async function getRevisionsByTaskId(taskId: string): Promise<RevisionEntry[]> {
  const sb = getSupabase()
  const { data } = await sb.from('revisions').select('*').eq('task_id', taskId).order('draft_number', { ascending: true })
  if (!data) return []
  return data.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    draftNumber: r.draft_number, storagePath: r.storage_path, viewUrl: r.view_url,
    designerNote: r.designer_note || '', pmComment: r.pm_comment || '',
    status: r.status, submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at || undefined, reviewedBy: r.reviewed_by || undefined,
  }))
}

// ── Approved Files ────────────────────────────────────────────────────────
export async function getApprovedFiles(): Promise<ApprovedFile[]> {
  const sb = getSupabase()
  const { data } = await sb.from('approved').select('*').order('approved_at', { ascending: false })
  if (!data) return []
  return data.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    sowMonth: r.sow_month, deliverableType: r.deliverable_type,
    storagePath: r.storage_path, viewUrl: r.view_url,
    totalDrafts: r.total_drafts, approvedAt: r.approved_at, approvedBy: r.approved_by,
  }))
}

export async function saveApprovedFile(file: ApprovedFile, by = 'PM') {
  const sb = getSupabase()
  await sb.from('approved').upsert({
    id: file.id, task_id: file.taskId, task_name: file.taskName,
    client_name: file.clientName, designer_name: file.designerName,
    sow_month: file.sowMonth, deliverable_type: file.deliverableType,
    storage_path: file.storagePath, view_url: file.viewUrl,
    total_drafts: file.totalDrafts, approved_at: file.approvedAt, approved_by: file.approvedBy,
  }, { onConflict: 'task_id' })
  await logActivity(
    by, 'Creative Approved', file.taskName,
    `client: ${file.clientName}, designer: ${file.designerName}, drafts: ${file.totalDrafts}`
  )
}
