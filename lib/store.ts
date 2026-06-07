import { readAll, appendRow, upsertRow, deleteRow, updateRow, ensureAllTabs, logActivity } from './sheets'
import { Task, SOWEntry, Client, Submission, RevisionEntry, ApprovedFile, CLIENTS } from './types'
import { SEEDED_SOW } from './seedSOW'

let initialized = false
async function init() {
  if (initialized) return
  initialized = true
  await ensureAllTabs()
}

// ── Clients ───────────────────────────────────────────────────────────────
export async function getClients(): Promise<Client[]> {
  await init()
  const rows = await readAll<{ id: string; name: string }>('clients')
  if (rows.length === 0) {
    for (const c of CLIENTS) await appendRow('clients', { id: c.id, name: c.name })
    return CLIENTS
  }
  const existingIds = new Set(rows.map(r => r.id))
  for (const c of CLIENTS) {
    if (!existingIds.has(c.id)) await appendRow('clients', { id: c.id, name: c.name })
  }
  return rows.map(r => ({ id: r.id, name: r.name }))
}

export async function saveClient(client: Client, by = 'PM') {
  await init()
  await upsertRow('clients', 'id', client.id, { id: client.id, name: client.name })
  await logActivity(by, 'Client Saved', client.name, `id: ${client.id}`)
}

export async function deleteClient(id: string, by = 'PM') {
  await init()
  await deleteRow('clients', 'id', id)
  await logActivity(by, 'Client Deleted', id, '')
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export async function getTasks(): Promise<Task[]> {
  await init()
  const rows = await readAll<Record<string, string>>('tasks')
  return rows.map(r => ({
    id: r.id, clientId: r.client_id, clientName: r.client_name,
    name: r.name, deliverableType: r.deliverable_type as never,
    assignedTo: r.assigned_to, deadline: r.deadline,
    brief: r.brief, createdAt: r.created_at,
    createdBy: r.created_by, sowMonth: r.sow_month,
  }))
}

export async function saveTask(task: Task) {
  await init()
  await upsertRow('tasks', 'id', task.id, {
    id: task.id, client_id: task.clientId, client_name: task.clientName,
    name: task.name, deliverable_type: task.deliverableType,
    assigned_to: task.assignedTo, deadline: task.deadline,
    brief: task.brief || '', created_at: task.createdAt,
    created_by: task.createdBy, sow_month: task.sowMonth || '',
  })
  await logActivity(
    task.createdBy || 'PM', 'Task Created', task.name,
    `client: ${task.clientName}, assigned: ${task.assignedTo}, deadline: ${task.deadline}`
  )
}

export async function deleteTask(id: string, by = 'PM') {
  await init()
  await deleteRow('tasks', 'id', id)
  await logActivity(by, 'Task Deleted', id, '')
}

// ── SOW ───────────────────────────────────────────────────────────────────
export async function getSOW(): Promise<SOWEntry[]> {
  await init()
  const rows = await readAll<Record<string, string>>('sow')
  if (rows.length === 0) {
    for (const e of SEEDED_SOW) await appendRow('sow', {
      client_id: e.clientId, service_type: e.serviceType,
      total_creatives: e.totalCreatives, priority: e.priority,
      status: e.status, reels: e.reels, stories: e.stories,
      statics: e.statics, videos: e.videos, photos: e.photos,
      carousels: e.carousels, youtube_shorts: e.youtubeShorts,
      approved_count: 0,
    })
    return SEEDED_SOW
  }
  return rows.map(r => ({
    clientId: r.client_id, serviceType: r.service_type,
    totalCreatives: Number(r.total_creatives), priority: r.priority,
    status: r.status, reels: Number(r.reels), stories: Number(r.stories),
    statics: Number(r.statics), videos: Number(r.videos),
    photos: Number(r.photos), carousels: Number(r.carousels),
    youtubeShorts: Number(r.youtube_shorts),
    approvedCount: Number(r.approved_count || 0),
  }))
}

export async function saveSOWEntry(entry: SOWEntry, by = 'PM') {
  await init()
  await upsertRow('sow', 'client_id', entry.clientId, {
    client_id: entry.clientId, service_type: entry.serviceType,
    total_creatives: entry.totalCreatives, priority: entry.priority,
    status: entry.status, reels: entry.reels, stories: entry.stories,
    statics: entry.statics, videos: entry.videos, photos: entry.photos,
    carousels: entry.carousels, youtube_shorts: entry.youtubeShorts,
  })
  await logActivity(by, 'SOW Updated', entry.clientId, `service: ${entry.serviceType}, total: ${entry.totalCreatives}`)
}

// ── Submissions ───────────────────────────────────────────────────────────
export async function getSubmissions(): Promise<Submission[]> {
  await init()
  const rows = await readAll<Record<string, string>>('submissions')
  return rows.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    deliverableType: r.deliverable_type as never,
    fileType: r.file_type, fileName: r.file_name,
    storagePath: r.storage_path, viewUrl: r.view_url,
    draftNumber: Number(r.draft_number),
    status: r.status as never,
    designerNote: r.designer_note, pmComment: r.pm_comment,
    submittedAt: r.submitted_at, reviewedAt: r.reviewed_at || undefined,
    reviewedBy: r.reviewed_by || undefined,
  }))
}

export async function saveSubmission(sub: Submission) {
  await init()
  await upsertRow('submissions', 'task_id', sub.taskId, {
    id: sub.id, task_id: sub.taskId, task_name: sub.taskName,
    client_name: sub.clientName, designer_name: sub.designerName,
    deliverable_type: sub.deliverableType, file_type: sub.fileType,
    file_name: sub.fileName, storage_path: sub.storagePath,
    view_url: sub.viewUrl, draft_number: sub.draftNumber,
    status: sub.status, designer_note: sub.designerNote,
    pm_comment: sub.pmComment || '',
    submitted_at: sub.submittedAt,
    reviewed_at: sub.reviewedAt || '',
    reviewed_by: sub.reviewedBy || '',
  })
}

export async function getSubmissionByTaskId(taskId: string): Promise<Submission | undefined> {
  const subs = await getSubmissions()
  return subs.find(s => s.taskId === taskId)
}

export async function updateSubmission(taskId: string, patch: Partial<Submission>) {
  await init()
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
  await updateRow('submissions', 'task_id', taskId, mapped)
}

// ── Revisions ─────────────────────────────────────────────────────────────
export async function getRevisions(): Promise<RevisionEntry[]> {
  await init()
  const rows = await readAll<Record<string, string>>('revisions')
  return rows.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    draftNumber: Number(r.draft_number),
    storagePath: r.storage_path, viewUrl: r.view_url,
    designerNote: r.designer_note, pmComment: r.pm_comment,
    status: r.status, submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at || undefined,
    reviewedBy: r.reviewed_by || undefined,
  }))
}

export async function appendRevision(rev: RevisionEntry) {
  await init()
  await appendRow('revisions', {
    id: rev.id, task_id: rev.taskId, task_name: rev.taskName,
    client_name: rev.clientName, designer_name: rev.designerName,
    draft_number: rev.draftNumber, storage_path: rev.storagePath,
    view_url: rev.viewUrl, designer_note: rev.designerNote,
    pm_comment: rev.pmComment || '', status: rev.status,
    submitted_at: rev.submittedAt,
    reviewed_at: rev.reviewedAt || '',
    reviewed_by: rev.reviewedBy || '',
  })
}

export async function updateRevision(taskId: string, draftNumber: number, patch: Partial<RevisionEntry>) {
  await init()
  const rows = await readAll<Record<string, string>>('revisions')
  const row  = rows.find(r => r.task_id === taskId && Number(r.draft_number) === draftNumber)
  if (!row) return
  const mapped: Record<string, unknown> = {}
  if (patch.status      !== undefined) mapped.status      = patch.status
  if (patch.pmComment   !== undefined) mapped.pm_comment  = patch.pmComment
  if (patch.reviewedAt  !== undefined) mapped.reviewed_at = patch.reviewedAt
  if (patch.reviewedBy  !== undefined) mapped.reviewed_by = patch.reviewedBy
  await updateRow('revisions', 'id', row.id, mapped)
}

export async function getRevisionsByTaskId(taskId: string): Promise<RevisionEntry[]> {
  const revs = await getRevisions()
  return revs.filter(r => r.taskId === taskId)
}

// ── Approved Files ────────────────────────────────────────────────────────
export async function getApprovedFiles(): Promise<ApprovedFile[]> {
  await init()
  const rows = await readAll<Record<string, string>>('approved')
  return rows.map(r => ({
    id: r.id, taskId: r.task_id, taskName: r.task_name,
    clientName: r.client_name, designerName: r.designer_name,
    sowMonth: r.sow_month, deliverableType: r.deliverable_type,
    storagePath: r.storage_path, viewUrl: r.view_url,
    totalDrafts: Number(r.total_drafts),
    approvedAt: r.approved_at, approvedBy: r.approved_by,
  }))
}

export async function saveApprovedFile(file: ApprovedFile, by = 'PM') {
  await init()
  await upsertRow('approved', 'task_id', file.taskId, {
    id: file.id, task_id: file.taskId, task_name: file.taskName,
    client_name: file.clientName, designer_name: file.designerName,
    sow_month: file.sowMonth, deliverable_type: file.deliverableType,
    storage_path: file.storagePath, view_url: file.viewUrl,
    total_drafts: file.totalDrafts,
    approved_at: file.approvedAt, approved_by: file.approvedBy,
  })
  await logActivity(
    by, 'Creative Approved', file.taskName,
    `client: ${file.clientName}, designer: ${file.designerName}, drafts: ${file.totalDrafts}`
  )
}
