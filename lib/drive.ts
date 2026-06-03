import { google } from 'googleapis'

// Root folder name — service account will create/own this in its own Drive
const ROOT_FOLDER_NAME = process.env.DRIVE_ROOT_FOLDER_NAME || 'Makers Studio'

// Optional: if you want files to also be shared back to a human Google account
const SHARE_WITH_EMAIL = process.env.DRIVE_SHARE_WITH_EMAIL || ''

function getAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set')
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

async function getAccessToken(): Promise<string> {
  const auth = getAuth()
  const token = await auth.getAccessToken()
  if (!token) throw new Error('Could not obtain access token from service account')
  return token as string
}

// Find folder by name under a parent (or at root if parentId is null)
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

// Create a folder (under parentId, or at root if null)
async function createFolder(token: string, name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) body.parents = [parentId]

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?fields=id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create folder "${name}": ${err}`)
  }
  const data = await res.json()

  // Optionally share back with human account so you can browse it
  if (SHARE_WITH_EMAIL && !parentId) {
    await shareWithEmail(token, data.id, SHARE_WITH_EMAIL).catch(() => {})
  }

  return data.id as string
}

async function shareWithEmail(token: string, fileId: string, email: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
    }
  )
}

// Cache root folder id in memory (resets on cold start, but that's fine)
let cachedRootId: string | null = null

async function getRootFolderId(): Promise<string> {
  if (cachedRootId) return cachedRootId
  const token = await getAccessToken()
  let id = await findFolder(token, ROOT_FOLDER_NAME, null)
  if (!id) {
    id = await createFolder(token, ROOT_FOLDER_NAME, null)
    console.log(`Created root folder "${ROOT_FOLDER_NAME}" (id: ${id}) in service account Drive`)
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

export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
): Promise<string> {
  const token = await getAccessToken()
  const metadata = { name: fileName, parents: [folderId] }
  const boundary = 'meraki_boundary_x7k9'
  const metaStr  = JSON.stringify(metadata)

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed: ${err}`)
  }

  const data = await res.json()
  return data.id as string
}

export async function makePublic(fileId: string): Promise<string> {
  const token = await getAccessToken()
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  )
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
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
  } catch { /* ignore */ }
}

export async function finalizeUpload(fileId: string): Promise<string> {
  return makePublic(fileId)
}
