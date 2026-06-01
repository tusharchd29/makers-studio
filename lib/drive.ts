import { google } from 'googleapis'

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID!

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

// Ensure a subfolder exists under a parent; create if missing. Returns folder ID.
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id!
}

// Upload file using raw multipart request — avoids service account quota error
export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
): Promise<string> {
  const auth = getAuth()
  const token = await auth.getAccessToken()

  const metadata = JSON.stringify({ name: fileName, parents: [folderId] })
  const boundary = 'meraki_boundary_x7k9'

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
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

// Make file readable by anyone with the link
export async function makePublic(fileId: string): Promise<string> {
  const auth = getAuth()
  const token = await auth.getAccessToken()

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })

  return `https://drive.google.com/file/d/${fileId}/view`
}

// Get folder ID for client/task path, creating as needed
export async function getOrCreateTaskFolder(clientName: string, taskName: string): Promise<string> {
  const clientFolder = await ensureFolder(clientName, ROOT_FOLDER_ID)
  return await ensureFolder(taskName, clientFolder)
}

// Delete a file from Drive (best-effort)
export async function deleteFile(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient()
    await drive.files.delete({ fileId, supportsAllDrives: true })
  } catch { /* ignore */ }
}

// Legacy — kept for compatibility
export async function finalizeUpload(fileId: string): Promise<string> {
  return makePublic(fileId)
}

export async function createResumableUploadUrl(): Promise<string> {
  throw new Error('Use uploadFileToDrive instead')
}
