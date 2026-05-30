import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getDrive, getOrCreateFolder, uploadFileToDrive, getNextVersion, appendSubmissionToSheet, getAllSubmissions, updateSubmissionStatus, getClientsFromSheet } from '@/lib/drive'
import { randomUUID } from 'crypto'

// Tell Vercel: max 60s, use Node.js runtime (not Edge) so we can stream files
export const runtime = 'nodejs'
export const maxDuration = 60

const DRIVE_ROOT = process.env.DRIVE_ROOT_FOLDER_ID!
const HAS_DRIVE = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

function getCurrentMonth() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function getFileType(mimeType: string): 'video' | 'photo' {
  return mimeType.startsWith('video/') ? 'video' : 'photo'
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!HAS_DRIVE) return NextResponse.json([])
  try {
    const all = await getAllSubmissions()
    if (user.role === 'designer') {
      return NextResponse.json(all.filter((s: { designerName: string }) => s.designerName === user.name))
    }
    return NextResponse.json(all)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
  }

  const file = formData.get('file') as File
  const taskId = formData.get('taskId') as string
  const taskName = formData.get('taskName') as string
  const clientId = formData.get('clientId') as string
  const deliverableType = formData.get('deliverableType') as string
  const checklist = JSON.parse((formData.get('checklist') as string) || '[]')
  const notes = (formData.get('notes') as string) || ''

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const submissionId = randomUUID()
  const fileType = getFileType(file.type)
  const month = getCurrentMonth()
  const ext = file.name.split('.').pop() || 'bin'

  if (!HAS_DRIVE) {
    // No Drive configured — mock success so UI doesn't hang
    const version = 1
    const fileName = `${taskName} - v${version}.${ext}`
    const drivePath = `Makers Studio / ${clientId} / ${month} / ${fileType === 'video' ? 'Videos' : 'Photos'} / ${fileName}`
    return NextResponse.json({ id: submissionId, driveViewUrl: '#', drivePath, version, fileName, warning: 'Drive not configured' })
  }

  try {
    // Get client info from Sheets
    const clients = await getClientsFromSheet()
    const client = clients.find(c => c.id === clientId)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

    const drive = await getDrive()

    // Build folder path: Client → Month → Videos|Photos
    const clientFolderId = client.driveFolderId || await getOrCreateFolder(drive, client.name, DRIVE_ROOT)
    const monthFolderId = await getOrCreateFolder(drive, month, clientFolderId)
    const typeFolderName = fileType === 'video' ? 'Videos' : 'Photos'
    const typeFolderId = await getOrCreateFolder(drive, typeFolderName, monthFolderId)

    // Auto-version
    const version = await getNextVersion(drive, taskName, typeFolderId)
    const fileName = `${taskName} - v${version}.${ext}`

    // Upload — read as buffer once
    const buffer = Buffer.from(await file.arrayBuffer())
    const { viewUrl: driveViewUrl } = await uploadFileToDrive(drive, buffer, fileName, file.type, typeFolderId)
    const drivePath = `Makers Studio / ${client.name} / ${month} / ${typeFolderName} / ${fileName}`

    // Log to Sheet
    await appendSubmissionToSheet({
      id: submissionId, taskId, taskName, clientName: client.name,
      designerName: user.name, deliverableType, fileType,
      fileName, driveViewUrl, drivePath, version,
      status: 'pending', pmComment: '', checklist: checklist.join(', '),
      notes, submittedAt: new Date().toISOString(),
    })

    return NextResponse.json({ id: submissionId, driveViewUrl, drivePath, version, fileName })

  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed. Check Drive permissions and try again.', detail: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  if (!HAS_DRIVE) return NextResponse.json({ ok: true, warning: 'Drive not configured' })
  await updateSubmissionStatus(submissionId, status, pmComment || '', user.name)
  return NextResponse.json({ ok: true })
}
