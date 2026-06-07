export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { TABS } from '@/lib/sheets'

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID || '1ZruIEkU6r7WXV8QBVphEj35_xckHucatnbz-ijhqbYg'
const ACTIVITY_HEADERS = ['Timestamp','User','Action','Entity','Detail','PM Comment','Designer Note']

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== 'meraki-migrate-2026') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const log: string[] = []

  try {
    const sheets = getSheetsClient()

    // Get existing sheet tabs
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const existingTabs = (meta.data.sheets || []).map((s: any) => ({
      title: s.properties?.title,
      sheetId: s.properties?.sheetId,
    }))
    log.push(`Found ${existingTabs.length} existing tabs: ${existingTabs.map(t => t.title).join(', ')}`)

    const allNeededTabs = [
      ...Object.values(TABS).map(t => ({ name: t.name, headers: t.headers })),
      { name: 'Log_May-Jun_2026', headers: ACTIVITY_HEADERS },
      { name: 'revisions', headers: TABS.revisions.headers },
      { name: 'approved', headers: TABS.approved.headers },
      { name: 'locks', headers: TABS.locks.headers },
    ]

    // Deduplicate
    const seen = new Set<string>()
    const uniqueTabs = allNeededTabs.filter(t => {
      if (seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })

    const existingNames = existingTabs.map(t => t.title?.toLowerCase())

    // Add missing tabs one by one to avoid batch conflict errors
    for (const tab of uniqueTabs) {
      if (!existingNames.includes(tab.name.toLowerCase())) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests: [{ addSheet: { properties: { title: tab.name } } }] }
          })
          log.push(`Created tab: ${tab.name}`)
        } catch {
          log.push(`Tab already exists (skipped): ${tab.name}`)
        }
      }
    }

    // Now overwrite row 1 (headers) for every tab — force correct schema
    for (const tab of uniqueTabs) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab.name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [tab.headers] },
      })
      log.push(`✅ Headers updated: ${tab.name} → [${tab.headers.join(', ')}]`)
    }

    log.push('')
    log.push('🎉 Migration complete! All tabs have correct headers.')
    return NextResponse.json({ ok: true, log })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`❌ Error: ${msg}`)
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 })
  }
}
