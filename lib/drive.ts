// ── Digital Ocean Spaces — File Storage ───────────────────────────────────
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const MAX_FILE_SIZE_BYTES = 600 * 1024 * 1024 // 600MB
const ALLOWED_EXTENSIONS  = ['.mp4', '.mov', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']
const ALLOWED_MIME_TYPES  = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]
const MAX_DRAFTS = 2

function getS3Client(): S3Client {
  const endpoint = process.env.DO_SPACES_ENDPOINT
  const region   = process.env.DO_SPACES_REGION
  const key      = process.env.DO_SPACES_KEY
  const secret   = process.env.DO_SPACES_SECRET
  if (!endpoint || !region || !key || !secret) {
    throw new Error('Digital Ocean Spaces env vars not configured (DO_SPACES_ENDPOINT, DO_SPACES_REGION, DO_SPACES_KEY, DO_SPACES_SECRET)')
  }
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  })
}

function getBucket(): string {
  const bucket = process.env.DO_SPACES_BUCKET
  if (!bucket) throw new Error('DO_SPACES_BUCKET env var not set')
  return bucket
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

// ── File Validation ───────────────────────────────────────────────────────
export function validateFile(fileName: string, mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'File type not allowed. Accepted: MP4, MOV, JPG, PNG, PDF' }
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File too large. Maximum size is 600MB' }
  }
  return { valid: true }
}

// ── Upload file to DO Spaces ──────────────────────────────────────────────
// folderPath: e.g. "Honda/Reel Task" → stored as Honda/Reel Task/filename
export async function uploadFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderPath: string
): Promise<{ fileId: string; viewUrl: string }> {
  return withRetry(async () => {
    const s3     = getS3Client()
    const bucket = getBucket()
    const key    = `${folderPath}/${fileName}`
    const region = process.env.DO_SPACES_REGION!

    await s3.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
      ACL:         'public-read',
    }))

    // DigitalOcean Spaces public URL format:
    // If CDN is enabled: https://<bucket>.cdn.digitaloceanspaces.com/<key>
    // If CDN is disabled: https://<bucket>.<region>.digitaloceanspaces.com/<key>
    // Use DO_SPACES_CDN_ENDPOINT env if set (for custom CDN domains), otherwise build from region
    const cdnBase = process.env.DO_SPACES_CDN_ENDPOINT
      || `https://${bucket}.${region}.digitaloceanspaces.com`
    const viewUrl = `${cdnBase}/${key}`
    return { fileId: key, viewUrl }
  })
}

// ── Delete a file ─────────────────────────────────────────────────────────
export async function deleteFile(fileId: string): Promise<void> {
  try {
    await withRetry(async () => {
      const s3 = getS3Client()
      await s3.send(new DeleteObjectCommand({
        Bucket: getBucket(),
        Key:    fileId,
      }))
    })
  } catch { /* ignore — file may already be gone */ }
}

// ── Keep only last MAX_DRAFTS per task ────────────────────────────────────
export async function pruneOldDrafts(allFileIds: string[], keepFileId: string): Promise<void> {
  const others = allFileIds.filter(id => id && id !== keepFileId)
  if (others.length <= MAX_DRAFTS) return
  const toDelete = others.slice(0, others.length - MAX_DRAFTS)
  for (const fid of toDelete) await deleteFile(fid)
}

// ── On approval: delete all drafts, keep only approved file ──────────────
export async function deleteAllDraftsExcept(allFileIds: string[], keepFileId: string): Promise<void> {
  for (const fid of allFileIds) {
    if (fid && fid !== keepFileId) await deleteFile(fid)
  }
}
