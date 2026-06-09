export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

function getS3Client(): S3Client {
  const endpoint = process.env.DO_SPACES_ENDPOINT
  const region   = process.env.DO_SPACES_REGION
  const key      = process.env.DO_SPACES_KEY
  const secret   = process.env.DO_SPACES_SECRET
  if (!endpoint || !region || !key || !secret) {
    throw new Error('DO Spaces env vars not configured')
  }
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG, WebP or GIF allowed for brief images' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 })
    }

    const ext       = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName  = `brief-images/${randomUUID()}.${ext}`
    const bucket    = process.env.DO_SPACES_BUCKET
    if (!bucket) throw new Error('DO_SPACES_BUCKET not set')

    const s3       = getS3Client()
    const arrayBuf = await file.arrayBuffer()
    const buffer   = Buffer.from(arrayBuf)

    await s3.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         fileName,
      Body:        buffer,
      ContentType: file.type,
      ACL:         'public-read',
    }))

    const region  = process.env.DO_SPACES_REGION!
    const cdnBase = process.env.DO_SPACES_CDN_ENDPOINT
      || `https://${bucket}.${region}.digitaloceanspaces.com`
    const imageUrl = `${cdnBase}/${fileName}`

    return NextResponse.json({ imageUrl, fileName })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
