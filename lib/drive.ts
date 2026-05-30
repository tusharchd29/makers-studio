import { google } from 'googleapis'
import { Readable } from 'stream'

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

export async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return created.data.id!
}

export async function uploadFileToDrive(
  drive: ReturnType<typeof google.drive>,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentId: string
): Promise<{ id: string; viewUrl: string }> {
  const stream = Readable.from(buffer)
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  })
  return {
    id: res.data.id!,
    viewUrl: res.data.webViewLink!,
  }
}

export async function getNextVersion(
  drive: ReturnType<typeof google.drive>,
  taskName: string,
  parentId: string
): Promise<number> {
  const res = await drive.files.list({
    q: `name contains '${taskName} - v' and '${parentId}' in parents and trashed=false`,
    fields: 'files(name)',
  })
  const files = res.data.files || []
  const versions = files.map(f => {
    const match = f.name?.match(/- v(\d+)/)
    return match ? parseInt(match[1]) : 0
  })
  return versions.length > 0 ? Math.max(...versions) + 1 : 1
}

export async function appendSubmissionToSheet(submission: {
  id: string
  taskId: string
  taskName: string
  clientName: string
  designerName: string
  deliverableType: string
  fileType: string
  fileName: string
  driveViewUrl: string
  drivePath: string
  version: number
  status: string
  pmComment: string
  checklist: string
  notes: string
  submittedAt: string
}) {
  const sheets = await getSheets()
  const sheetId = process.env.SUBMISSIONS_SHEET_ID!
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:P',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        submission.id,
        submission.taskId,
        submission.taskName,
        submission.clientName,
        submission.designerName,
        submission.deliverableType,
        submission.fileType,
        submission.fileName,
        `v${submission.version}`,
        submission.status,
        submission.pmComment,
        submission.checklist,
        submission.notes,
        submission.drivePath,
        submission.driveViewUrl,
        submission.submittedAt,
      ]],
    },
  })
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: string,
  pmComment: string,
  reviewedBy: string
) {
  const sheets = await getSheets()
  const sheetId = process.env.SUBMISSIONS_SHEET_ID!
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:A',
  })
  const rows = res.data.values || []
  const rowIndex = rows.findIndex(r => r[0] === submissionId)
  if (rowIndex === -1) return
  const row = rowIndex + 1
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `Sheet1!J${row}`, values: [[status]] },
        { range: `Sheet1!K${row}`, values: [[pmComment]] },
        { range: `Sheet1!Q${row}`, values: [[new Date().toISOString()]] },
        { range: `Sheet1!R${row}`, values: [[reviewedBy]] },
      ],
    },
  })
}

export async function getAllSubmissions() {
  const sheets = await getSheets()
  const sheetId = process.env.SUBMISSIONS_SHEET_ID!
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:R',
  })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  return rows.slice(1).map(r => ({
    id: r[0], taskId: r[1], taskName: r[2], clientName: r[3],
    designerName: r[4], deliverableType: r[5], fileType: r[6],
    fileName: r[7], version: r[8], status: r[9], pmComment: r[10],
    checklist: r[11], notes: r[12], drivePath: r[13], driveViewUrl: r[14],
    submittedAt: r[15], reviewedAt: r[16], reviewedBy: r[17],
  }))
}
