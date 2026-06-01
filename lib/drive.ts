// Google Drive file upload helper — resumable uploads for large files (70MB+)

import { google } from 'googleapis'

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID!

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// Ensure a subfolder exists under a parent; create if missing. Returns folder ID.
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return created.data.id!
}

// Create a resumable upload session. Returns the upload URL.
// Browser then PUTs the file directly to this URL (no size limit, progress tracking).
export async function createResumableUploadUrl(
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<string> {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  const token = await auth.getAccessToken()

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    }
  )
  if (!res.ok) throw new Error(`Failed to create resumable session: ${await res.text()}`)
  const uploadUrl = res.headers.get('location')
  if (!uploadUrl) throw new Error('No upload URL in response')
  return uploadUrl
}

// After upload completes, get the file ID and make it readable by link.
// Pass the upload URL — Drive returns the file metadata on final chunk.
export async function finalizeUpload(fileId: string): Promise<string> {
  if (!fileId) throw new Error('finalizeUpload: fileId is empty')
  const drive = getDriveClient()
  // Make file readable by anyone with the link
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    })
  } catch (e) {
    // Permission may already exist — continue
    console.warn('Permission create warning:', e)
  }
  const viewUrl = `https://drive.google.com/file/d/${fileId}/view`
  return viewUrl
}

// Get folder ID for a client/task path, creating as needed
export async function getOrCreateTaskFolder(clientName: string, taskName: string): Promise<string> {
  const clientFolder = await ensureFolder(clientName, ROOT_FOLDER_ID)
  const taskFolder   = await ensureFolder(taskName, clientFolder)
  return taskFolder
}

// Delete a file from Drive by fileId (best-effort)
export async function deleteFile(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient()
    await drive.files.delete({ fileId })
  } catch { /* ignore */ }
}
