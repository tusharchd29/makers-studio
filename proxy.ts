import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'makers-studio-secret-2026'
)

export async function proxy(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  const path = req.nextUrl.pathname

  if (path.startsWith('/designer') || path.startsWith('/pm')) {
    if (!token) return NextResponse.redirect(new URL('/', req.url))
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const user = (payload as { user: { role: string } }).user
      if (path.startsWith('/pm') && user.role !== 'pm') {
        return NextResponse.redirect(new URL('/designer/tasks', req.url))
      }
      if (path.startsWith('/designer') && user.role !== 'designer') {
        return NextResponse.redirect(new URL('/pm/dashboard', req.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/designer/:path*', '/pm/:path*'],
}
