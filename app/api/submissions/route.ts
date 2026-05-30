export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { randomUUID } from 'crypto'

const BUCKET = 'makers-studio'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

function getFileType(mimeType: string): 'Videos' | 'Photos' {
  return mimeType.startsWith('video/') ? 'Videos' : 'Photos'
}

function getCurrentMonth() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  let query = db.from('makers_studio_submissions').select('*').order('submitted_at', { ascending: false })
  if (user.role === 'designer') query = query.eq('designer_name', user.name)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'designer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 }) }

  const file             = formData.get('file') as File
  const taskId           = formData.get('taskId') as string
  const taskName         = formData.get('taskName') as string
  const clientId         = formData.get('clientId') as string
  const deliverableType  = formData.get('deliverableType') as string
  const checklist        = JSON.parse((formData.get('checklist') as string) || '[]')
  const notes            = (formData.get('notes') as string) || ''

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()

  try {
    // Get client
    const { data: clientData, error: clientErr } = await db
      .from('makers_studio_clients').select('*').eq('id', clientId).single()
    if (clientErr || !clientData) return NextResponse.json({ error: 'Client not found' }, { status: 400 })

    const fileType    = getFileType(file.type)
    const month       = getCurrentMonth()
    const ext         = file.name.split('.').pop() || 'bin'
    const folderPath  = `${clientData.name}/${month}/${fileType}`

    // Auto-version
    const { data: existing } = await db.storage.from(BUCKET).list(folderPath, { search: taskName })
    const versions = (existing || []).map((f: { name: string }) => {
      const m = f.name.match(/- v(\d+)/)
      return m ? parseInt(m[1]) : 0
    })
    const version     = versions.length > 0 ? Math.max(...versions) + 1 : 1
    const fileName    = `${taskName} - v${version}.${ext}`
    const storagePath = `${folderPath}/${fileName}`

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // Signed URL — 10 years
    const { data: signedData, error: signErr } = await db.storage
      .from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
    if (signErr || !signedData) throw new Error(`Signed URL failed: ${signErr?.message}`)

    const submissionId = randomUUID()
    const { error: insertErr } = await db.from('makers_studio_submissions').insert({
      id: submissionId, task_id: taskId, task_name: taskName,
      client_name: clientData.name, designer_name: user.name,
      deliverable_type: deliverableType, file_type: fileType.toLowerCase(),
      file_name: fileName, storage_path: storagePath,
      view_url: signedData.signedUrl, version,
      status: 'pending', pm_comment: '',
      checklist: checklist.join(', '), notes,
      submitted_at: new Date().toISOString(),
    })
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`)

    return NextResponse.json({
      id: submissionId, viewUrl: signedData.signedUrl,
      storagePath, version, fileName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { submissionId, status, pmComment } = await req.json()
  const { getDB } = await import('@/lib/supabase')
  const db = await getDB()
  const { error } = await db.from('makers_studio_submissions').update({
    status, pm_comment: pmComment || '',
    reviewed_at: new Date().toISOString(), reviewed_by: user.name,
  }).eq('id', submissionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
