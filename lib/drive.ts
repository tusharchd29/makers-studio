// Google Drive file upload helper for makers-studio
// Files are uploaded directly to a shared Drive folder using a service account.

import { google } from 'googleapis'
import { Readable } from 'stream'

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// Root folder ID for makers-studio uploads (set in env)
export function getRootFolderId(): string {
  const id = process.env.DRIVE_ROOT_FOLDER_ID
  if (!id) throw new Error('DRIVE_ROOT_FOLDER_ID env var not set')
  return id
}

// Ensure a subfolder exists under a parent; create if missing. Returns folder ID.
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return created.data.id!
}

// Upload a file buffer to Drive. Returns { fileId, viewUrl }.
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<{ fileId: string; viewUrl: string }> {
  const drive = getDriveClient()
  const stream = Readable.from(buffer)
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  })
  const fileId   = res.data.id!
  const viewUrl  = res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
  // Make file readable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  })
  return { fileId, viewUrl }
}

// Delete a file from Drive by fileId (best-effort, won't throw)
export async function deleteFile(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient()
    await drive.files.delete({ fileId })
  } catch {
    // ignore — file may already be gone
  }
}
