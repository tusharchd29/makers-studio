// ── Storage Stub ──────────────────────────────────────────────────────────
// File storage solution to be decided in meeting.
// Replace this file with the chosen provider implementation.
// All function signatures are fixed — do not change them.

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024 // 150MB
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]

// ── File Validation (provider-agnostic) ───────────────────────────────────
export function validateFile(fileName: string, mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'File type not allowed. Accepted: MP4, MOV, JPG, PNG, PDF' }
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File too large. Maximum size is 150MB' }
  }
  return { valid: true }
}

// ── Upload file — STUB ─────────────────────────────────────────────────────
// Returns: { fileId, viewUrl }
export async function uploadFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderPath: string  // e.g. "ClientName/TaskName"
): Promise<{ fileId: string; viewUrl: string }> {
  throw new Error('Storage provider not configured. Decide in meeting and implement.')
}

// ── Delete a file by ID — STUB ─────────────────────────────────────────────
export async function deleteFile(fileId: string): Promise<void> {
  // TODO: implement with chosen provider
}

// ── Prune old drafts — keep last 2 per task ───────────────────────────────
// fileIds: all known draft fileIds ordered oldest→newest
export async function pruneOldDrafts(allFileIds: string[], keepFileId: string): Promise<void> {
  const MAX_DRAFTS = 2
  const others = allFileIds.filter(id => id && id !== keepFileId)
  if (others.length <= MAX_DRAFTS) return
  const toDelete = others.slice(0, others.length - MAX_DRAFTS)
  for (const fid of toDelete) await deleteFile(fid)
}

// ── Delete all drafts except approved file ────────────────────────────────
export async function deleteAllDraftsExcept(allFileIds: string[], keepFileId: string): Promise<void> {
  for (const fid of allFileIds) {
    if (fid && fid !== keepFileId) await deleteFile(fid)
  }
}
