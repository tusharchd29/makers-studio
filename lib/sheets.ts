// ── Google Sheets — Full Database + Activity Log ───────────────────────────
// Sheet rotation: every 2 months a new data sheet is created automatically.
// Tabs: clients, tasks, sow, submissions, revisions, approved, locks
//       Activity Log (rotates every 2 months)
//       Data tabs: Data_Jan-Feb_2026, Data_Mar-Apr_2026, etc.

import { google, sheets_v4 } from 'googleapis'

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID!
const IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER || ''

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    ...(IMPERSONATE_USER ? { subject: IMPERSONATE_USER } : {}),
  })
  return google.sheets({ version: 'v4', auth })
}

// ── Retry wrapper ─────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 600): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('Retry exhausted')
}

// ── 2-month period logic ──────────────────────────────────────────────────
// Returns tab name for the current 2-month period e.g. "Data_Jan-Feb_2026"
function getCurrentPeriodTabName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  // Group months into pairs: Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
  const periodStart = Math.floor(month / 2) * 2
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `Data_${months[periodStart]}-${months[periodStart + 1]}_${year}`
}

// Activity log tab also rotates every 2 months
function getCurrentActivityTabName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const periodStart = Math.floor(month / 2) * 2
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `Log_${months[periodStart]}-${months[periodStart + 1]}_${year}`
}

// ── Tab definitions ───────────────────────────────────────────────────────
export const TABS = {
  clients:     { name: 'clients',     headers: ['id','name'] },
  tasks:       { name: 'tasks',       headers: ['id','client_id','client_name','name','deliverable_type','assigned_to','deadline','brief','created_at','created_by','sow_month'] },
  sow:         { name: 'sow',         headers: ['client_id','service_type','total_creatives','priority','status','reels','stories','statics','videos','photos','carousels','youtube_shorts','approved_count'] },
  submissions: { name: 'submissions', headers: ['id','task_id','task_name','client_name','designer_name','deliverable_type','file_type','file_name','storage_path','view_url','draft_number','status','designer_note','pm_comment','submitted_at','reviewed_at','reviewed_by'] },
  revisions:   { name: 'revisions',   headers: ['id','task_id','task_name','client_name','designer_name','draft_number','storage_path','view_url','designer_note','pm_comment','status','submitted_at','reviewed_at','reviewed_by'] },
  approved:    { name: 'approved',    headers: ['id','task_id','task_name','client_name','designer_name','sow_month','deliverable_type','storage_path','view_url','total_drafts','approved_at','approved_by'] },
  locks:       { name: 'locks',       headers: ['task_id','locked_at','locked_by'] },
}

type TabName = keyof typeof TABS

const ACTIVITY_HEADERS = ['Timestamp','User','Action','Entity','Detail','PM Comment','Designer Note']

// ── Ensure tab exists with headers ────────────────────────────────────────
async function ensureTab(sheets: sheets_v4.Sheets, tabName: string, headers: string[]) {
  return withRetry(async () => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const existing = (meta.data.sheets || []).map((s: sheets_v4.Schema$Sheet) => s.properties?.title)

    if (!existing.includes(tabName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      })
      // Write headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      })
    } else {
      // Ensure headers exist
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: `${tabName}!1:1`,
      })
      if (!res.data.values || res.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${tabName}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        })
      }
    }
  })
}

// ── Ensure all core tabs exist ────────────────────────────────────────────
export async function ensureAllTabs() {
  const sheets = getSheetsClient()
  for (const tab of Object.values(TABS)) {
    await ensureTab(sheets, tab.name, tab.headers)
  }
  // Ensure current activity log tab
  await ensureTab(sheets, getCurrentActivityTabName(), ACTIVITY_HEADERS)
}

// ── Helper: column letter ─────────────────────────────────────────────────
function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ── Read all rows as objects ──────────────────────────────────────────────
export async function readAll<T>(tab: TabName): Promise<T[]> {
  return withRetry(async () => {
    const sheets  = getSheetsClient()
    const headers = TABS[tab].headers
    await ensureTab(sheets, tab, headers)
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
  })
}

// ── Append a new row ──────────────────────────────────────────────────────
export async function appendRow(tab: TabName, obj: Record<string, unknown>) {
  return withRetry(async () => {
    const sheets  = getSheetsClient()
    const headers = TABS[tab].headers
    await ensureTab(sheets, tab, headers)
    const row = headers.map(h => obj[h] ?? '')
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })
  })
}

// ── Update a row by matching a key column ─────────────────────────────────
export async function updateRow(tab: TabName, keyCol: string, keyVal: string, patch: Record<string, unknown>): Promise<boolean> {
  return withRetry(async () => {
    const sheets  = getSheetsClient()
    const headers = TABS[tab].headers
    const keyIdx  = headers.indexOf(keyCol)
    if (keyIdx < 0) throw new Error(`Column ${keyCol} not in ${tab}`)

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A:${colLetter(headers.length)}`,
    })
    const rows   = res.data.values || []
    const rowIdx = rows.findIndex((r, i) => i > 0 && r[keyIdx] === keyVal)
    if (rowIdx < 0) return false

    const existing = rows[rowIdx]
    const updated  = headers.map((h, i) => (h in patch ? patch[h] : existing[i]) ?? '')
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A${rowIdx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updated] },
    })
    return true
  })
}

// ── Upsert ────────────────────────────────────────────────────────────────
export async function upsertRow(tab: TabName, keyCol: string, keyVal: string, obj: Record<string, unknown>) {
  const updated = await updateRow(tab, keyCol, keyVal, obj)
  if (!updated) await appendRow(tab, obj)
}

// ── Delete a row by key ───────────────────────────────────────────────────
export async function deleteRow(tab: TabName, keyCol: string, keyVal: string) {
  return withRetry(async () => {
    const sheets  = getSheetsClient()
    const headers = TABS[tab].headers
    const keyIdx  = headers.indexOf(keyCol)

    const meta    = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const sheetId = (meta.data.sheets || []).find(
      (s: sheets_v4.Schema$Sheet) => s.properties?.title === tab
    )?.properties?.sheetId

    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: `${tab}!A:${colLetter(headers.length)}`,
    })
    const rows   = res.data.values || []
    const rowIdx = rows.findIndex((r, i) => i > 0 && r[keyIdx] === keyVal)
    if (rowIdx < 0 || sheetId == null) return

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
      }}]},
    })
  })
}

// ── Activity Log — writes to current 2-month rotating tab ────────────────
export async function logActivity(
  user: string,
  action: string,
  entity: string,
  detail: string,
  pmComment = '',
  designerNote = ''
): Promise<void> {
  try {
    const sheets   = getSheetsClient()
    const tabName  = getCurrentActivityTabName()
    await ensureTab(sheets, tabName, ACTIVITY_HEADERS)
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[timestamp, user, action, entity, detail, pmComment, designerNote]] },
    })
  } catch { /* never block main flow */ }
}

// ── Submission lock ───────────────────────────────────────────────────────
export async function acquireLock(taskId: string, designerName: string): Promise<boolean> {
  try {
    const rows = await readAll<{ task_id: string; locked_at: string }>('locks')
    const existing = rows.find(r => r.task_id === taskId)
    if (existing) {
      const age = Date.now() - new Date(existing.locked_at).getTime()
      if (age < 10 * 60 * 1000) return false
      await deleteRow('locks', 'task_id', taskId)
    }
    await appendRow('locks', { task_id: taskId, locked_at: new Date().toISOString(), locked_by: designerName })
    return true
  } catch { return true }
}

export async function releaseLock(taskId: string): Promise<void> {
  try { await deleteRow('locks', 'task_id', taskId) } catch { /* ignore */ }
}

// ── SOW approved count ────────────────────────────────────────────────────
export async function incrementSOWApprovedCount(clientId: string) {
  try {
    const rows = await readAll<Record<string, string>>('sow')
    const row  = rows.find(r => r.client_id === clientId)
    if (!row) return
    const current = parseInt(row.approved_count || '0', 10)
    await updateRow('sow', 'client_id', clientId, { approved_count: current + 1 })
  } catch { /* never block */ }
}
