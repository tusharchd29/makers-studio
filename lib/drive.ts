import { google } from 'googleapis'
import { Readable } from 'stream'
import { SOWEntry, Task, Client } from './types'
import { SEEDED_SOW } from './seedSOW'

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set')

  let key: Record<string, string>
  try {
    key = JSON.parse(keyJson)
  } catch {
    // Vercel sometimes double-escapes newlines in env vars — fix it
    const fixed = keyJson.replace(/\\n/g, '\n')
    key = JSON.parse(fixed)
  }

  // Make sure private_key has real newlines, not escaped \n
  if (key.private_key) {
    key.private_key = key.private_key.replace(/\\n/g, '\n')
  }

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

// Ensure all 4 tabs exist with headers
async function ensureSheetTabs() {
  const sheets = await getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  const needed = ['Submissions', 'Tasks', 'SOW', 'Clients']
  const toCreate = needed.filter(n => !existing.includes(n))
  if (toCreate.length === 0) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) },
  })
  const headerData: { range: string; values: string[][] }[] = []
  if (toCreate.includes('Submissions')) headerData.push({ range: 'Submissions!A1:R1', values: [['id','taskId','taskName','clientName','designerName','deliverableType','fileType','fileName','version','status','pmComment','checklist','notes','drivePath','driveViewUrl','submittedAt','reviewedAt','reviewedBy']] })
  if (toCreate.includes('Tasks')) headerData.push({ range: 'Tasks!A1:J1', values: [['id','clientId','clientName','name','deliverableType','assignedTo','deadline','brief','createdAt','createdBy']] })
  if (toCreate.includes('SOW')) headerData.push({ range: 'SOW!A1:H1', values: [['clientId','reels','stories','statics','videos','photos','carousels','youtubeShorts']] })
  if (toCreate.includes('Clients')) headerData.push({ range: 'Clients!A1:C1', values: [['id','name','driveFolderId']] })
  if (headerData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: headerData },
    })
  }
}

// ─── DRIVE ─────────────────────────────────────────────────────────
export async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)',
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return created.data.id!
}

export async function uploadFileToDrive(drive: ReturnType<typeof google.drive>, buffer: Buffer, fileName: string, mimeType: string, parentId: string): Promise<{ id: string; viewUrl: string }> {
  // Use raw multipart upload via fetch — works with personal Drive folders shared with service accounts
  // The googleapis SDK stream upload fails with "Service Accounts do not have storage quota"
  const auth = (drive as unknown as { _options: { auth: { getAccessToken: () => Promise<{ token: string }> } } })._options.auth
  const tokenRes = await auth.getAccessToken()
  const accessToken = tokenRes.token

  const metadata = JSON.stringify({ name: fileName, parents: [parentId] })
  const boundary = 'makers_studio_boundary_' + Date.now()

  const bodyParts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]
  const body = Buffer.concat(bodyParts)

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as { id: string; webViewLink: string }
  return { id: data.id, viewUrl: data.webViewLink }
}

export async function getNextVersion(drive: ReturnType<typeof google.drive>, taskName: string, parentId: string): Promise<number> {
  const safeName = taskName.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `name contains '${safeName} - v' and '${parentId}' in parents and trashed=false`,
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
    requestBody: { valueInputOption: 'RAW', data: [
      { range: `Submissions!J${row}`, values: [[status]] },
      { range: `Submissions!K${row}`, values: [[pmComment]] },
      { range: `Submissions!Q${row}`, values: [[new Date().toISOString()]] },
      { range: `Submissions!R${row}`, values: [[reviewedBy]] },
    ]},
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
  const values = [[task.id, task.clientId, task.clientName, task.name, task.deliverableType, task.assignedTo, task.deadline, task.brief, task.createdAt, task.createdBy]]
  if (rowIndex >= 1) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `Tasks!A${rowIndex + 1}:J${rowIndex + 1}`, valueInputOption: 'RAW', requestBody: { values } })
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Tasks!A:J', valueInputOption: 'RAW', requestBody: { values } })
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
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId: tasksSheet.properties!.sheetId!, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }] } })
}

// ─── SOW ───────────────────────────────────────────────────────────
export async function getSOWFromSheet(): Promise<SOWEntry[]> {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SOW!A:H' })
  const rows = res.data.values || []
  if (rows.length < 2) {
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
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'SOW!A:H', valueInputOption: 'RAW', requestBody: { values: rows } })
}

export async function saveSOWToSheet(entry: SOWEntry) {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SOW!A:A' })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === entry.clientId)
  const values = [[entry.clientId, entry.reels, entry.stories, entry.statics, entry.videos, entry.photos, entry.carousels, entry.youtubeShorts]]
  if (rowIndex >= 1) {
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `SOW!A${rowIndex + 1}:H${rowIndex + 1}`, valueInputOption: 'RAW', requestBody: { values } })
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'SOW!A:H', valueInputOption: 'RAW', requestBody: { values } })
  }
}

// ─── CLIENTS ───────────────────────────────────────────────────────
export async function getClientsFromSheet(): Promise<Client[]> {
  await ensureSheetTabs()
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Clients!A:C' })
  const rows = res.data.values || []
  if (rows.length < 2) {
    const { CLIENTS } = await import('./types')
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Clients!A:C', valueInputOption: 'RAW', requestBody: { values: CLIENTS.map(c => [c.id, c.name, c.driveFolderId || '']) } })
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
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `Clients!A${rowIndex + 1}:C${rowIndex + 1}`, valueInputOption: 'RAW', requestBody: { values } })
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Clients!A:C', valueInputOption: 'RAW', requestBody: { values } })
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
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId: clientsSheet.properties!.sheetId!, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }] } })
}
