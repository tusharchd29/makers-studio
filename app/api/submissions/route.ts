import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getDrive, getOrCreateFolder, uploadFileToDrive, getNextVersion, appendSubmissionToSheet, getAllSubmissions, updateSubmissionStatus } from '@/lib/drive'
import { getClients } from '@/lib/store'
import { randomUUID } from 'crypto'

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

  const formData = await req.formData()
  const file = formData.get('file') as File
  const taskId = formData.get('taskId') as string
  const taskName = formData.get('taskName') as string
  const clientId = formData.get('clientId') as string
  const deliverableType = formData.get('deliverableType') as string
  const checklist = JSON.parse(formData.get('checklist') as string || '[]')
  const notes = formData.get('notes') as string || ''

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const clients = getClients()
  const client = clients.find(c => c.id === clientId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

  const fileType = getFileType(file.type)
  const month = getCurrentMonth()
  const submissionId = randomUUID()

  // If Drive is configured, upload for real
  if (HAS_DRIVE) {
    const drive = await getDrive()
    const clientFolderId = client.driveFolderId || await getOrCreateFolder(drive, client.name, DRIVE_ROOT)
    const monthFolderId = await getOrCreateFolder(drive, month, clientFolderId)
    const typeFolderName = fileType === 'video' ? 'Videos' : 'Photos'
    const typeFolderId = await getOrCreateFolder(drive, typeFolderName, monthFolderId)

    const version = await getNextVersion(drive, taskName, typeFolderId)
    const ext = file.name.split('.').pop()
    const fileName = `${taskName} - v${version}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { id: driveFileId, viewUrl: driveViewUrl } = await uploadFileToDrive(drive, buffer, fileName, file.type, typeFolderId)
    const drivePath = `Makers Studio / ${client.name} / ${month} / ${typeFolderName} / ${fileName}`

    await appendSubmissionToSheet({
      id: submissionId, taskId, taskName, clientName: client.name,
      designerName: user.name, deliverableType, fileType,
      fileName, driveViewUrl, drivePath, version,
      status: 'pending', pmComment: '', checklist: checklist.join(', '),
      notes, submittedAt: new Date().toISOString(),
    })

    return NextResponse.json({ id: submissionId, driveViewUrl, drivePath, version, fileName })
  }

  // Drive not configured yet — return mock success
  const version = 1
  const ext = file.name.split('.').pop()
  const fileName = `${taskName} - v${version}.${ext}`
  const drivePath = `Makers Studio / ${client.name} / ${month} / ${fileType === 'video' ? 'Videos' : 'Photos'} / ${fileName}`
  return NextResponse.json({
    id: submissionId, driveViewUrl: '#', drivePath, version, fileName,
    warning: 'Drive not configured — file not uploaded. Add GOOGLE_SERVICE_ACCOUNT_KEY to enable.',
  })
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  if (!HAS_DRIVE) return NextResponse.json({ ok: true, warning: 'Drive not configured' })
  await updateSubmissionStatus(submissionId, status, pmComment || '', user.name)
  return NextResponse.json({ ok: true })
}
