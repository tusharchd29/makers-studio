export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'meraki-cors-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const endpoint = process.env.DO_SPACES_ENDPOINT!      // e.g. https://sgp1.digitaloceanspaces.com
  const region   = process.env.DO_SPACES_REGION!        // e.g. sgp1
  const key      = process.env.DO_SPACES_KEY!
  const secret_  = process.env.DO_SPACES_SECRET!
  const bucket   = process.env.DO_SPACES_BUCKET || 'makers-studio'

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret_ },
    forcePathStyle: false,
  })

  try {
    // Set CORS
    await s3.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders:  ['ETag'],
          MaxAgeSeconds:  3600,
        }]
      }
    }))

    // Read back to confirm
    const result = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))
    return NextResponse.json({ success: true, rules: result.CORSRules })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Try to get more detail
    const detail = (e as { Code?: string; $metadata?: { httpStatusCode?: number } })
    return NextResponse.json({
      success: false,
      error: msg,
      code: detail.Code,
      status: detail.$metadata?.httpStatusCode,
      tip: 'The Spaces key may lack s3:PutBucketCors permission. Try generating a new Spaces key with full permissions in DO console under API > Spaces Keys.'
    }, { status: 500 })
  }
}
