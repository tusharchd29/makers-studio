import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

const ROOT_FOLDER_NAME    = process.env.DRIVE_ROOT_FOLDER_NAME || 'Makers Studio'
const IMPERSONATE_USER    = process.env.GOOGLE_IMPERSONATE_USER || ''

function getJWT(): JWT {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set')
  if (!IMPERSONATE_USER) throw new Error('GOOGLE_IMPERSONATE_USER env var is not set (e.g. tech@merakiads.in)')
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_USER,  // impersonate this user — files land in their Drive
  })
}

async function getAccessToken(): Promise<string> {
  const jwt = getJWT()
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('Could not obtain access token via impersonation')
  return token
}

async function findFolder(token: string, name: string, parentId: string | null): Promise<string | null> {
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
}

async function createFolder(token: string, name: string, parentId: string | null): Promise<string> {
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

export async function uploadFileToDrive(fileName: string, mimeType: string, buffer: Buffer, folderId: string): Promise<string> {
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
}

export async function makePublic(fileId: string): Promise<string> {
  const token = await getAccessToken()
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
  return `https://drive.google.com/file/d/${fileId}/view`
}

export async function getOrCreateTaskFolder(clientName: string, taskName: string): Promise<string> {
  const rootId = await getRootFolderId()
  const clientFolder = await ensureFolder(clientName, rootId)
  return await ensureFolder(taskName, clientFolder)
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    const token = await getAccessToken()
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch { /* ignore */ }
}

export async function finalizeUpload(fileId: string): Promise<string> { return makePublic(fileId) }
