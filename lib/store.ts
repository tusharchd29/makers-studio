import fs from 'fs'
import path from 'path'
import { Task, SOWEntry, Client, Submission, RevisionEntry, ApprovedFile, CLIENTS } from './types'
import { SEEDED_SOW } from './seedSOW'

const DATA_DIR = path.join(process.cwd(), 'data')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readJSON<T>(file: string, defaultValue: T): T {
  ensureDataDir()
  const p = path.join(DATA_DIR, file)
  if (!fs.existsSync(p)) return defaultValue
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return defaultValue }
}

function writeJSON<T>(file: string, data: T) {
  ensureDataDir()
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2))
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export function getTasks(): Task[] { return readJSON<Task[]>('tasks.json', []) }
export function saveTask(task: Task) {
  const tasks = getTasks()
  const idx = tasks.findIndex(t => t.id === task.id)
  if (idx >= 0) tasks[idx] = task; else tasks.push(task)
  writeJSON('tasks.json', tasks)
}
export function deleteTask(id: string) {
  writeJSON('tasks.json', getTasks().filter(t => t.id !== id))
}

// ── SOW ───────────────────────────────────────────────────────────────────
export function getSOW(): SOWEntry[] {
  const existing = readJSON<SOWEntry[]>('sow.json', [])
  if (existing.length === 0) {
    writeJSON('sow.json', SEEDED_SOW)
    return SEEDED_SOW
  }
  return existing
}
export function saveSOWEntry(entry: SOWEntry) {
  const sow = getSOW()
  const idx = sow.findIndex(s => s.clientId === entry.clientId)
  if (idx >= 0) sow[idx] = entry; else sow.push(entry)
  writeJSON('sow.json', sow)
}

// ── Clients ───────────────────────────────────────────────────────────────
export function getClients(): Client[] {
  return readJSON<Client[]>('clients.json', CLIENTS)
}
export function saveClient(client: Client) {
  const clients = getClients()
  const idx = clients.findIndex(c => c.id === client.id)
  if (idx >= 0) clients[idx] = client; else clients.push(client)
  writeJSON('clients.json', clients)
}
export function deleteClient(id: string) {
  writeJSON('clients.json', getClients().filter(c => c.id !== id))
}

// ── Submissions ───────────────────────────────────────────────────────────
export function getSubmissions(): Submission[] {
  return readJSON<Submission[]>('submissions.json', [])
}
export function saveSubmission(sub: Submission) {
  const subs = getSubmissions()
  const idx = subs.findIndex(s => s.taskId === sub.taskId)
  if (idx >= 0) subs[idx] = sub; else subs.unshift(sub)
  writeJSON('submissions.json', subs)
}
export function getSubmissionByTaskId(taskId: string): Submission | undefined {
  return getSubmissions().find(s => s.taskId === taskId)
}
export function updateSubmission(taskId: string, patch: Partial<Submission>) {
  const subs = getSubmissions()
  const idx = subs.findIndex(s => s.taskId === taskId)
  if (idx >= 0) { subs[idx] = { ...subs[idx], ...patch }; writeJSON('submissions.json', subs) }
}

// ── Revisions ─────────────────────────────────────────────────────────────
export function getRevisions(): RevisionEntry[] {
  return readJSON<RevisionEntry[]>('revisions.json', [])
}
export function appendRevision(rev: RevisionEntry) {
  const revs = getRevisions()
  revs.push(rev)
  writeJSON('revisions.json', revs)
}
export function updateRevision(taskId: string, draftNumber: number, patch: Partial<RevisionEntry>) {
  const revs = getRevisions()
  const idx = revs.findIndex(r => r.taskId === taskId && r.draftNumber === draftNumber)
  if (idx >= 0) { revs[idx] = { ...revs[idx], ...patch }; writeJSON('revisions.json', revs) }
}
export function getRevisionsByTaskId(taskId: string): RevisionEntry[] {
  return getRevisions().filter(r => r.taskId === taskId)
}

// ── Approved Files ────────────────────────────────────────────────────────
export function getApprovedFiles(): ApprovedFile[] {
  return readJSON<ApprovedFile[]>('approved.json', [])
}
export function saveApprovedFile(file: ApprovedFile) {
  const files = getApprovedFiles()
  const idx = files.findIndex(f => f.taskId === file.taskId)
  if (idx >= 0) files[idx] = file; else files.unshift(file)
  writeJSON('approved.json', files)
}
