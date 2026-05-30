export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function GET() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) return NextResponse.json({ error: 'No key set' })

  try {
    let key: Record<string, string>
    try {
      key = JSON.parse(keyJson)
    } catch {
      const fixed = keyJson.replace(/\\n/g, '\n')
      key = JSON.parse(fixed)
    }
    if (key.private_key) key.private_key = key.private_key.replace(/\\n/g, '\n')

    // Test auth
    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
    const client = await auth.getClient()
    const token = await client.getAccessToken()

    return NextResponse.json({
      ok: true,
      client_email: key.client_email,
      project_id: key.project_id,
      has_token: !!token.token,
      private_key_starts: key.private_key?.slice(0, 40),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) })
  }
}
