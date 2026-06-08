export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { google } from 'googleapis'

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID || '1ZruIEkU6r7WXV8QBVphEj35_xckHucatnbz-ijhqbYg'

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sheets = getSheetsClient()

    // Read all rows from approved tab
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'approved!A:L',
    })

    const rows = res.data.values || []
    if (rows.length <= 1) return NextResponse.json({ ok: true, message: 'No data to clean', removed: 0 })

    const headers = rows[0] // ['id','task_id','task_name','client_name','designer_name','sow_month','deliverable_type','storage_path','view_url','total_drafts','approved_at','approved_by']
    const dataRows = rows.slice(1)

    const taskNameIdx = headers.indexOf('task_name')
    const taskIdIdx   = headers.indexOf('task_id')
    const draftsIdx   = headers.indexOf('total_drafts')

    // Group by task_name (most reliable dedup key since old rows may have different task_id)
    const seen = new Map<string, { rowIndex: number; drafts: number }>()
    const toDelete: number[] = [] // 1-indexed row numbers in sheet

    dataRows.forEach((row, i) => {
      const key = (row[taskNameIdx] || '') + '|' + (row[taskIdIdx] || '')
      const drafts = Number(row[draftsIdx] || 0)
      const sheetRow = i + 2 // +1 for header, +1 for 1-indexing

      if (!seen.has(row[taskNameIdx] || '')) {
        seen.set(row[taskNameIdx] || '', { rowIndex: sheetRow, drafts })
      } else {
        const existing = seen.get(row[taskNameIdx] || '')!
        if (drafts > existing.drafts) {
          // Current row is newer — delete the old one
          toDelete.push(existing.rowIndex)
          seen.set(row[taskNameIdx] || '', { rowIndex: sheetRow, drafts })
        } else {
          // Current row is older — delete it
          toDelete.push(sheetRow)
        }
      }
    })

    if (toDelete.length === 0) {
      return NextResponse.json({ ok: true, message: 'No duplicates found', removed: 0 })
    }

    // Get sheet ID
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const sheetId = (meta.data.sheets || []).find(s => s.properties?.title === 'approved')?.properties?.sheetId

    if (sheetId == null) return NextResponse.json({ error: 'approved tab not found' }, { status: 500 })

    // Delete rows in reverse order to preserve indices
    const sortedDesc = [...toDelete].sort((a, b) => b - a)
    for (const rowNum of sortedDesc) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum }
          }}]
        }
      })
    }

    return NextResponse.json({ ok: true, message: `Removed ${toDelete.length} duplicate row(s)`, removed: toDelete.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
