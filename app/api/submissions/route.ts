import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import {
  uploadFileToStorage, getNextVersion,
  appendSubmissionToSheet, getAllSubmissions,
  updateSubmissionStatus, getClientsFromSheet
} from '@/lib/drive'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const HAS_STORAGE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

function getCurrentMonth() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function getFileType(mimeType: string): 'Videos' | 'Photos' {
  return mimeType.startsWith('video/') ? 'Videos' : 'Photos'
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!HAS_STORAGE) return NextResponse.json([])
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

  if (!HAS_STORAGE) {
    const version = 1
    const fileName = `${taskName} - v${version}.${ext}`
    return NextResponse.json({ id: submissionId, viewUrl: '#', storagePath: `mock/${fileName}`, version, fileName, warning: 'Storage not configured' })
  }

  try {
    const clients = await getClientsFromSheet()
    const client = clients.find(c => c.id === clientId)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

    // Auto-version
    const version = await getNextVersion(client.name, taskName, month, fileType)
    const fileName = `${taskName} - v${version}.${ext}`

    // Storage path: ClientName/Month/Videos|Photos/filename
    const storagePath = `${client.name}/${month}/${fileType}/${fileName}`

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { viewUrl } = await uploadFileToStorage(buffer, storagePath, file.type)

    // Log to Sheet
    await appendSubmissionToSheet({
      id: submissionId, taskId, taskName, clientName: client.name,
      designerName: user.name, deliverableType, fileType: fileType.toLowerCase(),
      fileName, viewUrl, storagePath, version,
      status: 'pending', pmComment: '', checklist: checklist.join(', '),
      notes, submittedAt: new Date().toISOString(),
    })

    return NextResponse.json({ id: submissionId, viewUrl, storagePath, version, fileName })

  } catch (err) {
    console.error('Upload error:', err)
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  if (!HAS_STORAGE) return NextResponse.json({ ok: true, warning: 'Storage not configured' })
  await updateSubmissionStatus(submissionId, status, pmComment || '', user.name)
  return NextResponse.json({ ok: true })
}
