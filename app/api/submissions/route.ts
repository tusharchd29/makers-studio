export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import {
  appendSubmissionToSheet, getAllSubmissions,
  updateSubmissionStatus, getClientsFromSheet
} from '@/lib/drive'
import { randomUUID } from 'crypto'

// NOTE: No Supabase import at the top level.
// getSupabaseClient() is called inside POST only, at request time.

const HAS_STORAGE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'makers-studio'

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
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 }) }

  const file       = formData.get('file') as File
  const taskId     = formData.get('taskId') as string
  const taskName   = formData.get('taskName') as string
  const clientId   = formData.get('clientId') as string
  const deliverableType = formData.get('deliverableType') as string
  const checklist  = JSON.parse((formData.get('checklist') as string) || '[]')
  const notes      = (formData.get('notes') as string) || ''

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const submissionId = randomUUID()
  const fileType = getFileType(file.type)
  const month    = getCurrentMonth()
  const ext      = file.name.split('.').pop() || 'bin'

  if (!HAS_STORAGE) {
    return NextResponse.json({ id: submissionId, viewUrl: '#', storagePath: 'mock', version: 1, fileName: `${taskName} - v1.${ext}`, warning: 'Storage not configured' })
  }

  try {
    const clients = await getClientsFromSheet()
    const client  = clients.find(c => c.id === clientId)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

    // ── Supabase imported HERE, inside the async function, at request time only ──
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Auto-version: count existing files with same task name in folder
    const folderPath = `${client.name}/${month}/${fileType}`
    const { data: existing } = await sb.storage.from(BUCKET).list(folderPath, { search: taskName })
    const versions = (existing || []).map(f => { const m = f.name.match(/- v(\d+)/); return m ? parseInt(m[1]) : 0 })
    const version  = versions.length > 0 ? Math.max(...versions) + 1 : 1
    const fileName = `${taskName} - v${version}.${ext}`
    const storagePath = `${folderPath}/${fileName}`

    // Upload
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    // Signed URL (10 years)
    const { data: signedData, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
    if (signErr || !signedData) throw new Error(`Signed URL failed: ${signErr?.message}`)

    const viewUrl = signedData.signedUrl

    // Log to Sheet
    await appendSubmissionToSheet({
      id: submissionId, taskId, taskName, clientName: client.name,
      designerName: user.name, deliverableType,
      fileType: fileType.toLowerCase(), fileName, viewUrl, storagePath,
      version, status: 'pending', pmComment: '',
      checklist: checklist.join(', '), notes,
      submittedAt: new Date().toISOString(),
    })

    return NextResponse.json({ id: submissionId, viewUrl, storagePath, version, fileName })

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('Upload error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  if (!HAS_STORAGE) return NextResponse.json({ ok: true })
  await updateSubmissionStatus(submissionId, status, pmComment || '', user.name)
  return NextResponse.json({ ok: true })
}
