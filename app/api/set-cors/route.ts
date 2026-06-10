export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

export async function GET(req: NextRequest) {
  // Simple secret check so random people can't call this
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== 'meraki-cors-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const endpoint = process.env.DO_SPACES_ENDPOINT!
  const region   = process.env.DO_SPACES_REGION!
  const key      = process.env.DO_SPACES_KEY!
  const secret_  = process.env.DO_SPACES_SECRET!
  const bucket   = process.env.DO_SPACES_BUCKET!

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret_ },
    forcePathStyle: false,
  })

  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders:  ['ETag'],
            MaxAgeSeconds:  3600,
          }
        ]
      }
    }))

    // Verify it was set
    const result = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))

    return NextResponse.json({
      success: true,
      message: 'CORS configured successfully on DO Spaces bucket',
      rules: result.CORSRules
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
