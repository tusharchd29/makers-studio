import { google } from 'googleapis'
import { Readable } from 'stream'
import { SOWEntry, Task, Client } from './types'
import { SEEDED_SOW } from './seedSOW'

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set')
  const key = JSON.parse(keyJson)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  })
}

export async function getDrive() {
  const auth = getAuth()
  return google.drive({ version: 'v3', auth })
}

export async function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

const SHEET_ID = process.env.SUBMISSIONS_SHEET_ID!

// ─── SHEET TABS ────────────────────────────────────────────────────
// Tab 1: Submissions   (columns A:R)
// Tab 2: Tasks         (columns A:J)
// Tab 3: SOW           (columns A:H)
// Tab 4: Clients       (columns A:C)

async function ensureSheetTabs() {
  const sheets = await getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  const needed = ['Submissions', 'Tasks', 'SOW', 'Clients']
  const toCreate = needed.filter(n => !existing.includes(n))
  if (toCreate.length === 0) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
    },
  })
  // Add headers
  const headerData = []
  if (toCreate.includes('Submissions')) {
    headerData.push({ range: 'Submissions!A1:R1', values: [['id','taskId','taskName','clientName','designerName','deliverableType','fileType','fileName','version','status','pmComment','checklist','notes','drivePath','driveViewUrl','submittedAt','reviewedAt','reviewedBy']] })
  }
  if (toCreate.includes('Tasks')) {
    headerData.push({ range: 'Tasks!A1:J1', values: [['id','clientId','clientName','name','deliverableType','assignedTo','deadline','brief','createdAt','createdBy']] })
  }
  if (toCreate.includes('SOW')) {
    headerData.push({ range: 'SOW!A1:H1', values: [['clientId','reels','stories','statics','videos','photos','carousels','youtubeShorts']] })
  }
  if (toCreate.includes('Clients')) {
    headerData.push({ range: 'Clients!A1:C1', values: [['id','name','driveFolderId']] })
  }
  if (headerData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: headerData },
    })
  }
}

// ─── DRIVE HELPERS ─────────────────────────────────────────────────
export async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return created.data.id!
}

export async function uploadFileToDrive(drive: ReturnType<typeof google.drive>, buffer: Buffer, fileName: string, mimeType: string, parentId: string): Promise<{ id: string; viewUrl: string }> {
  const stream = Readable.from(buffer)
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [parentId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  })
  return { id: res.data.id!, viewUrl: res.data.webViewLink! }
}

export async function getNextVersion(drive: ReturnType<typeof google.drive>, taskName: string, parentId: string): Promise<number> {
  const res = await drive.files.list({
    q: `name contains '${taskName} - v' and '${parentId}' in parents and trashed=false`,
    fields: 'files(name)',
  })
  const files = res.data.files || []
  const versions = files.map(f => { const m = f.name?.match(/- v(\d+)/); return m ? parseInt(m[1]) : 0 })
  return versions.length > 0 ? Math.max(...versions) + 1 : 1
}

// ─── SUBMISSIONS ───────────────────────────────────────────────────
export async function appendSubmissionToSheet(s: { id: string; taskId: string; taskName: string; clientName: string; designerName: string; deliverableType: string; fileType: string; fileName: string; driveViewUrl: string; drivePath: string; version: number; status: string; pmComment: string; checklist: string; notes: string; submittedAt: string }) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Submissions!A:R', valueInputOption: 'RAW',
    requestBody: { values: [[s.id, s.taskId, s.taskName, s.clientName, s.designerName, s.deliverableType, s.fileType, s.fileName, `v${s.version}`, s.status, s.pmComment, s.checklist, s.notes, s.drivePath, s.driveViewUrl, s.submittedAt, '', '']] },
  })
}

export async function updateSubmissionStatus(submissionId: string, status: string, pmComment: string, reviewedBy: string) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Submissions!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === submissionId)
  if (rowIndex === -1) return
  const row = rowIndex + 1
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `Submissions!J${row}`, values: [[status]] },
        { range: `Submissions!K${row}`, values: [[pmComment]] },
        { range: `Submissions!Q${row}`, values: [[new Date().toISOString()]] },
        { range: `Submissions!R${row}`, values: [[reviewedBy]] },
      ],
    },
  })
}

export async function getAllSubmissions() {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Submissions!A:R' })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  return rows.slice(1).map(r => ({
    id: r[0], taskId: r[1], taskName: r[2], clientName: r[3], designerName: r[4],
    deliverableType: r[5], fileType: r[6], fileName: r[7], version: r[8], status: r[9],
    pmComment: r[10], checklist: r[11], notes: r[12], drivePath: r[13], driveViewUrl: r[14],
    submittedAt: r[15], reviewedAt: r[16], reviewedBy: r[17],
  }))
}

// ─── TASKS ─────────────────────────────────────────────────────────
export async function getTasksFromSheet(): Promise<Task[]> {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A:J' })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  return rows.slice(1).map(r => ({
    id: r[0], clientId: r[1], clientName: r[2], name: r[3],
    deliverableType: r[4] as Task['deliverableType'], assignedTo: r[5],
    deadline: r[6], brief: r[7] || '', createdAt: r[8], createdBy: r[9],
  }))
}

export async function saveTaskToSheet(task: Task) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === task.id)
  if (rowIndex >= 1) {
    const row = rowIndex + 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Tasks!A${row}:J${row}`, valueInputOption: 'RAW',
      requestBody: { values: [[task.id, task.clientId, task.clientName, task.name, task.deliverableType, task.assignedTo, task.deadline, task.brief, task.createdAt, task.createdBy]] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Tasks!A:J', valueInputOption: 'RAW',
      requestBody: { values: [[task.id, task.clientId, task.clientName, task.name, task.deliverableType, task.assignedTo, task.deadline, task.brief, task.createdAt, task.createdBy]] },
    })
  }
}

export async function deleteTaskFromSheet(id: string) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex < 1) return
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const tasksSheet = sheetMeta.data.sheets?.find(s => s.properties?.title === 'Tasks')
  if (!tasksSheet) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: tasksSheet.properties!.sheetId!, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }] },
  })
}

// ─── SOW ───────────────────────────────────────────────────────────
export async function getSOWFromSheet(): Promise<SOWEntry[]> {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SOW!A:H' })
  const rows = res.data.values || []
  if (rows.length < 2) {
    // First time — seed from Postings SOW
    await seedSOW(sheets)
    return SEEDED_SOW
  }
  return rows.slice(1).map(r => ({
    clientId: r[0], reels: parseInt(r[1]) || 0, stories: parseInt(r[2]) || 0,
    statics: parseInt(r[3]) || 0, videos: parseInt(r[4]) || 0,
    photos: parseInt(r[5]) || 0, carousels: parseInt(r[6]) || 0, youtubeShorts: parseInt(r[7]) || 0,
  }))
}

async function seedSOW(sheets: ReturnType<typeof google.sheets>) {
  const rows = SEEDED_SOW.map(s => [s.clientId, s.reels, s.stories, s.statics, s.videos, s.photos, s.carousels, s.youtubeShorts])
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'SOW!A:H', valueInputOption: 'RAW',
    requestBody: { values: rows },
  })
}

export async function saveSOWToSheet(entry: SOWEntry) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SOW!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === entry.clientId)
  const values = [[entry.clientId, entry.reels, entry.stories, entry.statics, entry.videos, entry.photos, entry.carousels, entry.youtubeShorts]]
  if (rowIndex >= 1) {
    const row = rowIndex + 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `SOW!A${row}:H${row}`, valueInputOption: 'RAW',
      requestBody: { values },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'SOW!A:H', valueInputOption: 'RAW',
      requestBody: { values },
    })
  }
}

// ─── CLIENTS ───────────────────────────────────────────────────────
export async function getClientsFromSheet(): Promise<Client[]> {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Clients!A:C' })
  const rows = res.data.values || []
  if (rows.length < 2) {
    // Seed default clients
    const { CLIENTS } = await import('./types')
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Clients!A:C', valueInputOption: 'RAW',
      requestBody: { values: CLIENTS.map(c => [c.id, c.name, c.driveFolderId || '']) },
    })
    return CLIENTS
  }
  return rows.slice(1).map(r => ({ id: r[0], name: r[1], driveFolderId: r[2] || undefined }))
}

export async function saveClientToSheet(client: Client) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Clients!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === client.id)
  const values = [[client.id, client.name, client.driveFolderId || '']]
  if (rowIndex >= 1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Clients!A${rowIndex + 1}:C${rowIndex + 1}`, valueInputOption: 'RAW',
      requestBody: { values },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Clients!A:C', valueInputOption: 'RAW',
      requestBody: { values },
    })
  }
}

export async function deleteClientFromSheet(id: string) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Clients!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex < 1) return
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const clientsSheet = sheetMeta.data.sheets?.find(s => s.properties?.title === 'Clients')
  if (!clientsSheet) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: clientsSheet.properties!.sheetId!, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }] },
  })
}
