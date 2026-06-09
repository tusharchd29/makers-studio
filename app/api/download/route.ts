export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

/**
 * Proxy download — fetches the file from DO Spaces and streams it back
 * with Content-Disposition: attachment so the browser downloads it.
 *
 * Usage: GET /api/download?url=<encoded-url>&name=<encoded-filename>
 *
 * Only allows downloads from our own DO Spaces bucket domain.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawUrl  = searchParams.get('url')
  const rawName = searchParams.get('name') || 'download'

  if (!rawUrl) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  // Security: only allow downloads from DO Spaces domains
  let parsedUrl: URL
  try { parsedUrl = new URL(rawUrl) } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  const allowedHosts = [
    '.digitaloceanspaces.com',
    process.env.DO_SPACES_CDN_ENDPOINT
      ? new URL(process.env.DO_SPACES_CDN_ENDPOINT).hostname
      : null,
  ].filter(Boolean)

  const isAllowed = allowedHosts.some(h => h && parsedUrl.hostname.endsWith(h))
  if (!isAllowed) {
    return NextResponse.json({ error: 'URL not from allowed domain' }, { status: 403 })
  }

  try {
    const upstream = await fetch(rawUrl)
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const safeFileName = rawName.replace(/[^\w.\-_ ]/g, '_')

    // Stream back with download headers
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
