import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

const ROOT_FOLDER_NAME = process.env.DRIVE_ROOT_FOLDER_NAME || 'Makers Studio'
const IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER || ''

// Max draft files to keep per task in Drive (older ones auto-deleted)
const MAX_DRAFTS_IN_DRIVE = 2

function getJWT(): JWT {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set')
  if (!IMPERSONATE_USER) throw new Error('GOOGLE_IMPERSONATE_USER env var is not set (e.g. tech@merakiads.in)')
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_USER,
  })
}

async function getAccessToken(): Promise<string> {
  const jwt = getJWT()
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('Could not obtain access token via impersonation')
  return token
}

// ── Retry wrapper ─────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 800): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('Retry exhausted')
}

async function findFolder(token: string, name: string, parentId: string | null): Promise<string | null> {
  return withRetry(async () => {
    const parentClause = parentId ? `and '${parentId}' in parents` : `and 'root' in parents`
    const q = encodeURIComponent(
      `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' ${parentClause} and trashed=false`
    )
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.files?.[0]?.id ?? null
  })
}

async function createFolder(token: string, name: string, parentId: string | null): Promise<string> {
  return withRetry(async () => {
    const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
    if (parentId) body.parents = [parentId]
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { const err = await res.text(); throw new Error(`Failed to create folder "${name}": ${err}`) }
    const data = await res.json()
    return data.id as string
  })
}

let cachedRootId: string | null = null

async function getRootFolderId(): Promise<string> {
  if (cachedRootId) return cachedRootId
  const token = await getAccessToken()
  let id = await findFolder(token, ROOT_FOLDER_NAME, null)
  if (!id) {
    id = await createFolder(token, ROOT_FOLDER_NAME, null)
    console.log(`Created root folder "${ROOT_FOLDER_NAME}" in ${IMPERSONATE_USER}'s Drive (id: ${id})`)
  }
  cachedRootId = id
  return id
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const token = await getAccessToken()
  let id = await findFolder(token, name, parentId)
  if (!id) id = await createFolder(token, name, parentId)
  return id
}

// ── Allowed file types ────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']
const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024 // 150MB

export function validateFile(fileName: string, mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `File type not allowed. Accepted: MP4, MOV, JPG, PNG, PDF` }
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File too large. Maximum size is 150MB` }
  }
  return { valid: true }
}

export async function uploadFileToDrive(fileName: string, mimeType: string, buffer: Buffer, folderId: string): Promise<string> {
  return withRetry(async () => {
    const token = await getAccessToken()
    const metadata = { name: fileName, parents: [folderId] }
    const boundary = 'meraki_boundary_x7k9'
    const metaStr  = JSON.stringify(metadata)
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!res.ok) { const err = await res.text(); throw new Error(`Drive upload failed: ${err}`) }
    const data = await res.json()
    return data.id as string
  })
}

export async function makePublic(fileId: string): Promise<string> {
  return withRetry(async () => {
    const token = await getAccessToken()
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })
    return `https://drive.google.com/file/d/${fileId}/view`
  })
}

export async function getOrCreateTaskFolder(clientName: string, taskName: string): Promise<string> {
  const rootId = await getRootFolderId()
  const clientFolder = await ensureFolder(clientName, rootId)
  return await ensureFolder(taskName, clientFolder)
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    await withRetry(async () => {
      const token = await getAccessToken()
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
    })
  } catch { /* ignore — file may already be gone */ }
}

export async function finalizeUpload(fileId: string): Promise<string> { return makePublic(fileId) }

// ── Draft retention: keep only last N drafts per task in Drive ────────────
// fileIds: all known draft fileIds for this task, ordered oldest→newest
// approvedFileId: if set, always keep this one
export async function pruneOldDrafts(allFileIds: string[], keepFileId: string): Promise<void> {
  // Keep last MAX_DRAFTS_IN_DRIVE, always keep keepFileId
  const others = allFileIds.filter(id => id && id !== keepFileId)
  if (others.length <= MAX_DRAFTS_IN_DRIVE) return
  const toDelete = others.slice(0, others.length - MAX_DRAFTS_IN_DRIVE)
  for (const fid of toDelete) await deleteFile(fid)
}

// ── Delete all draft files on approval (keep only approved file) ──────────
export async function deleteAllDraftsExcept(allFileIds: string[], keepFileId: string): Promise<void> {
  for (const fid of allFileIds) {
    if (fid && fid !== keepFileId) await deleteFile(fid)
  }
}
