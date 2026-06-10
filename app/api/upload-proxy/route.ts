export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function PUT(req: NextRequest) {
  // Auth check
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Presigned URL and content-type passed as headers
  const presignedUrl  = req.headers.get('x-presigned-url')
  const contentType   = req.headers.get('x-content-type') || 'application/octet-stream'
  const contentLength = req.headers.get('content-length')

  if (!presignedUrl) return NextResponse.json({ error: 'Missing x-presigned-url header' }, { status: 400 })

  try {
    // Stream req.body directly to DO Spaces — no buffering, no arrayBuffer()
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-amz-acl':    'public-read',
    }
    if (contentLength) headers['Content-Length'] = contentLength

    const spacesRes = await fetch(presignedUrl, {
      method:  'PUT',
      headers,
      body:    req.body,  // raw stream — passes straight through
      // @ts-expect-error duplex required for streaming body in Node fetch
      duplex:  'half',
    })

    if (!spacesRes.ok) {
      const text = await spacesRes.text()
      return NextResponse.json(
        { error: `DO Spaces rejected upload (${spacesRes.status}): ${text.slice(0, 300)}` },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Proxy upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
