// Google Sheets as database for Makers Studio
// All tables are tabs in one spreadsheet.

import { google, sheets_v4 } from 'googleapis'

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID!

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ── Sheet tab definitions ─────────────────────────────────────────────────

export const TABS = {
  clients:      { name: 'clients',      headers: ['id','name','drive_folder_id'] },
  tasks:        { name: 'tasks',        headers: ['id','client_id','client_name','name','deliverable_type','assigned_to','deadline','brief','created_at','created_by','sow_month'] },
  sow:          { name: 'sow',          headers: ['client_id','service_type','total_creatives','priority','status','reels','stories','statics','videos','photos','carousels','youtube_shorts'] },
  submissions:  { name: 'submissions',  headers: ['id','task_id','task_name','client_name','designer_name','deliverable_type','file_type','file_name','file_id','view_url','draft_number','status','designer_note','pm_comment','submitted_at','reviewed_at','reviewed_by'] },
  revisions:    { name: 'revisions',    headers: ['id','task_id','task_name','client_name','designer_name','draft_number','file_id','view_url','designer_note','pm_comment','status','submitted_at','reviewed_at','reviewed_by'] },
  approved:     { name: 'approved',     headers: ['id','task_id','task_name','client_name','designer_name','sow_month','deliverable_type','file_id','view_url','total_drafts','approved_at','approved_by'] },
  activity_log: { name: 'activity_log', headers: ['timestamp','user','action','entity','detail'] },
}

type TabName = keyof typeof TABS

// ── Ensure all tabs exist with headers ───────────────────────────────────

export async function ensureAllTabs() {
  const sheets = getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const existing = (meta.data.sheets || []).map((s: sheets_v4.Schema$Sheet) => s.properties?.title)

  const requests: sheets_v4.Schema$Request[] = []
  for (const tab of Object.values(TABS)) {
    if (!existing.includes(tab.name)) {
      requests.push({ addSheet: { properties: { title: tab.name } } })
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } })
  }

  // Write headers to any tab that only has 0 or 1 rows
  for (const tab of Object.values(TABS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab.name}!1:1`,
    })
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab.name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [tab.headers] },
      })
    }
  }
}

// ── Generic read all rows as objects ─────────────────────────────────────

export async function readAll<T>(tab: TabName): Promise<T[]> {
  const sheets = getSheetsClient()
  const headers = TABS[tab].headers
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:${colLetter(headers.length)}`,
  })
  const rows = res.data.values || []
  if (rows.length <= 1) return []
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj as T
  })
}

// ── Append a new row ──────────────────────────────────────────────────────

export async function appendRow(tab: TabName, obj: Record<string, unknown>) {
  const sheets = getSheetsClient()
  const headers = TABS[tab].headers
  const row = headers.map(h => obj[h] ?? '')
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
}

// ── Update a row by matching a key column ────────────────────────────────

export async function updateRow(tab: TabName, keyCol: string, keyVal: string, patch: Record<string, unknown>) {
  const sheets = getSheetsClient()
  const headers = TABS[tab].headers
  const keyIdx = headers.indexOf(keyCol)
  if (keyIdx < 0) throw new Error(`Column ${keyCol} not in ${tab}`)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:${colLetter(headers.length)}`,
  })
  const rows = res.data.values || []
  const rowIdx = rows.findIndex((r, i) => i > 0 && r[keyIdx] === keyVal)
  if (rowIdx < 0) return false

  const existing = rows[rowIdx]
  const updated  = headers.map((h, i) => (h in patch ? patch[h] : existing[i]) ?? '')
  const sheetRow = rowIdx + 1 // 1-indexed

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updated] },
  })
  return true
}

// ── Upsert (update if key exists, append if not) ─────────────────────────

export async function upsertRow(tab: TabName, keyCol: string, keyVal: string, obj: Record<string, unknown>) {
  const updated = await updateRow(tab, keyCol, keyVal, obj)
  if (!updated) await appendRow(tab, obj)
}

// ── Delete a row by key ───────────────────────────────────────────────────

export async function deleteRow(tab: TabName, keyCol: string, keyVal: string) {
  const sheets = getSheetsClient()
  const headers = TABS[tab].headers
  const keyIdx  = headers.indexOf(keyCol)

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const sheetId = (meta.data.sheets || []).find(
    (s: sheets_v4.Schema$Sheet) => s.properties?.title === tab
  )?.properties?.sheetId

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A:A`,
  })
  const rows = res.data.values || []
  const rowIdx = rows.findIndex((r, i) => i > 0 && r[keyIdx] === keyVal)
  if (rowIdx < 0 || sheetId == null) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
        },
      }],
    },
  })
}

// ── Helper ────────────────────────────────────────────────────────────────

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ── Activity Log ──────────────────────────────────────────────────────────
// Call this anywhere to record an auditable event.
// action examples: 'SOW Updated', 'Task Created', 'Draft Submitted', 'Approved', 'Rejected', 'Client Added'
export async function logActivity(user: string, action: string, entity: string, detail: string) {
  try {
    const sheets = getSheetsClient()
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'activity_log!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[timestamp, user, action, entity, detail]] },
    })
  } catch { /* never let logging break the main flow */ }
}
