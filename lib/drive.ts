import { google } from 'googleapis'

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID!

function getAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set')
  if (!process.env.DRIVE_ROOT_FOLDER_ID) throw new Error('DRIVE_ROOT_FOLDER_ID env var is not set')
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

// Find a subfolder by name under a parent, or create it.
// Uses Drive REST API directly to support both My Drive and Shared Drives.
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const token = await getAccessToken()

  // Search for existing folder
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!searchRes.ok) {
    const err = await searchRes.text()
    throw new Error(`Drive folder search failed (parent: ${parentId}): ${err}`)
  }
  const searchData = await searchRes.json()
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id as string
  }

  // Create folder
  const createRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    }
  )
  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Drive folder create failed (parent: ${parentId}, name: ${name}): ${err}`)
  }
  const created = await createRes.json()
  return created.id as string
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
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true`,
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
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  )
  return `https://drive.google.com/file/d/${fileId}/view`
}

export async function getOrCreateTaskFolder(clientName: string, taskName: string): Promise<string> {
  const clientFolder = await ensureFolder(clientName, ROOT_FOLDER_ID)
  return await ensureFolder(taskName, clientFolder)
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    const token = await getAccessToken()
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
  } catch { /* ignore */ }
}

export async function finalizeUpload(fileId: string): Promise<string> {
  return makePublic(fileId)
}
