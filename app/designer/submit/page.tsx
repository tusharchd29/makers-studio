'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, getChecklistSections } from '@/lib/types'

const DESIGNER_TABS = [
  { label: 'My Tasks',       href: '/designer/tasks',       icon: 'ti-list-check' },
  { label: 'Submit Work',    href: '/designer/submit',      icon: 'ti-upload' },
  { label: 'My Submissions', href: '/designer/submissions', icon: 'ti-history' },
]

function SubmitForm() {
  const [user, setUser]             = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [tasks, setTasks]           = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [checklist, setChecklist]   = useState<string[]>([])
  const [notes, setNotes]           = useState('')
  const [drag, setDrag]             = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [uploadStep, setUploadStep] = useState('')
  const [result, setResult]         = useState<{ draftNumber: number; viewUrl: string; fileName: string } | null>(null)
  const [error, setError]           = useState('')
  const [subStatusMap, setSubStatusMap] = useState<Record<string, string>>({})
  const fileRef  = useRef<HTMLInputElement>(null)
  const xhrRef   = useRef<XMLHttpRequest | null>(null)
  const router   = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'designer') { router.push('/pm/dashboard'); return }
    setUser(u)
    fetch('/api/tasks').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setTasks(data)
        const tid = searchParams.get('taskId')
        if (tid) setSelectedTaskId(tid)
      }
    })
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const map: Record<string, string> = {}
        data.forEach((s: { taskId: string; status: string }) => {
          if (!map[s.taskId]) map[s.taskId] = s.status
        })
        setSubStatusMap(map)
      }
    })
  }, [router, searchParams])

  const submittableTasks = tasks.filter(t => {
    const s = subStatusMap[t.id]
    return !s || s === 'revision' || s === 'rejected'
  })
  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  function toggleCheck(item: string) {
    setChecklist(c => c.includes(item) ? c.filter(x => x !== item) : [...c, item])
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }
  function cancel() {
    xhrRef.current?.abort()
    setSubmitting(false); setProgress(0); setUploadStep('')
  }

  async function submit() {
    if (!selectedTask || !file) { setError('Please select a task and upload a file.'); return }
    if (subStatusMap[selectedTask.id] === 'pending') {
      setError('This task is already in review. Wait for PM feedback before resubmitting.')
      return
    }
    setSubmitting(true); setError(''); setProgress(5); setUploadStep('Preparing upload…')

    try {
      // Step 1 — get presigned PUT URL (tiny JSON to Vercel, no file bytes)
      setUploadStep('Preparing upload…')
      const metaRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName:   file.name,
          fileType:   file.type || 'application/octet-stream',
          fileSize:   file.size,
          taskId:     selectedTask.id,
          taskName:   selectedTask.name,
          clientName: selectedTask.clientName,
        }),
      })
      if (!metaRes.ok) {
        const d = await metaRes.json()
        throw new Error(d.error || `Failed to get upload URL (${metaRes.status})`)
      }
      const { presignedUrl, fileKey, draftName, draftNumber, viewUrl } =
        await metaRes.json() as { presignedUrl: string; fileKey: string; draftName: string; draftNumber: number; viewUrl: string }

      // Step 2 — stream file through /api/upload-proxy → DO Spaces (no CORS, no size limit)
      setUploadStep('Uploading to Spaces…')
      const uploadResult = await new Promise<{ fileId: string; draftName: string; draftNumber: number; viewUrl: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setProgress(10 + Math.round((e.loaded / e.total) * 80))
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) resolve({ fileId: fileKey, draftName, draftNumber, viewUrl })
            else reject(new Error(data.error || `Upload failed (${xhr.status})`))
          } catch {
            reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error — check your connection'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))
        xhr.open('PUT', '/api/upload-proxy')
        xhr.setRequestHeader('x-presigned-url', presignedUrl)
        xhr.setRequestHeader('x-content-type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      setProgress(92); setUploadStep('Saving submission…')

      // Step 2 — save submission record to Sheets
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId:          selectedTask.id,
          taskName:        selectedTask.name,
          clientName:      selectedTask.clientName,
          deliverableType: selectedTask.deliverableType,
          designerNote:    notes,
          fileId:          uploadResult.fileId,
          draftName:       uploadResult.draftName,
          draftNumber:     uploadResult.draftNumber,
          viewUrl:         uploadResult.viewUrl,
          checklistJson:   JSON.stringify(checklist),
          designerType:    user?.designerType || 'video',
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to save submission')
      }
      const data = await res.json()
      setProgress(100); setSubmitting(false)
      setResult({ draftNumber: data.draftNumber, viewUrl: data.viewUrl, fileName: data.fileName })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'Upload cancelled') { setSubmitting(false); setProgress(0); setUploadStep(''); return }
      setError(msg)
      setSubmitting(false); setProgress(0); setUploadStep('')
    }
  }

  function reset() {
    setSelectedTaskId(''); setFile(null); setChecklist([]); setNotes('')
    setResult(null); setError(''); setProgress(0)
  }

  if (!user) return null

  if (result) {
    return (
      <>
        <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/submit" tabs={DESIGNER_TABS} />
        <div className="page">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card" style={{ textAlign: 'center', padding: '36px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: '#3B6D11' }}>Submitted!</div>
              <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
                Draft {result.draftNumber} uploaded. PM will review shortly.
              </div>
              <div className="drive-path">📁 {result.fileName}</div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
                {result.viewUrl && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={result.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm">View File ↗</a>
                    <a href={`/api/download?url=${encodeURIComponent(result.viewUrl)}&name=${encodeURIComponent(result.fileName)}`} className="btn btn-sm">⬇ Download</a>
                  </div>
                )}
                <button className="btn btn-sm btn-primary" onClick={reset}>Submit Another</button>
                <a href="/designer/tasks?refresh=1" className="btn btn-sm">My Tasks</a>
              </div>
            </div>
            {/* Checklist summary — show as Done */}
            <div className="card-sm" style={{ padding: '0' }}>
              <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: '13px', borderBottom: '1px solid var(--border)', color: '#3B6D11' }}>
                ✅ Checklist — Submitted
              </div>
              {getChecklistSections(user.designerType).map(section => (
                <div key={section.section}>
                  <div style={{ padding: '6px 14px 3px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    {section.section}
                  </div>
                  {section.items.map(item => (
                    <div key={item} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '13px', color: checklist.includes(item) ? '#4ede8c' : '#ccc' }}>
                        {checklist.includes(item) ? '✓' : '○'}
                      </span>
                      <span style={{ fontSize: '12px', color: checklist.includes(item) ? 'var(--text)' : 'var(--text3)' }}>{item}</span>
                      {checklist.includes(item) && <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#4ede8c', background: '#4ede8c15', padding: '1px 7px', borderRadius: '10px' }}>Done</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/submit" tabs={DESIGNER_TABS} />
      <div className="page">
        <div className="section-header"><div className="section-title">Submit Work</div></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div className="field">
              <label className="field-label">Task *</label>
              <select className="field-select" value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)} disabled={submitting}>
                <option value="">Select a task…</option>
                {submittableTasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {subStatusMap[t.id] === 'revision' ? '🔄 ' : subStatusMap[t.id] === 'rejected' ? '❌ ' : ''}
                    {t.name} — {t.clientName}
                  </option>
                ))}
              </select>
            </div>

            {selectedTask && subStatusMap[selectedTask.id] === 'pending' && (
              <div style={{ padding: '10px 14px', background: '#ff9b4e15', border: '1px solid #ff9b4e40', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#ff9b4e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⏳ <strong>Awaiting PM review</strong> — you cannot resubmit until the PM responds.
              </div>
            )}
            {selectedTask && (
              <div className="card-sm" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span className="tag">{selectedTask.deliverableType}</span>
                  <span className="tag">Due {new Date(selectedTask.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                {selectedTask.brief && <div style={{ fontSize: '12px', color: '#888', marginBottom: selectedTask.briefImageUrl ? '8px' : '0' }}>{selectedTask.brief}</div>}
                {selectedTask.briefImageUrl && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#7DC242', textTransform: 'uppercase', marginBottom: '4px' }}>Reference Image</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedTask.briefImageUrl}
                      alt="Brief reference"
                      style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '6px', border: '1px solid var(--border)', objectFit: 'contain', cursor: 'pointer', display: 'block' }}
                      onClick={() => window.open(selectedTask.briefImageUrl, '_blank')}
                      title="Click to open full size"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label className="field-label">
                File *
                <span style={{ color: '#aaa', textTransform: 'none', fontSize: '11px', fontWeight: 400, marginLeft: '6px' }}>
                  MP4, MOV, AVI, MKV, JPG, PNG, PDF, PSD, AI, ZIP · max 600MB
                </span>
              </label>
              <div
                className={`upload-zone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => !submitting && fileRef.current?.click()}
                style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                <input ref={fileRef} type="file" style={{ display: 'none' }}
                  accept="image/*,video/*,.pdf,.psd,.ai,.eps,.svg,.zip,.rar,.mkv,.m4v,.wmv,.flv,.3gp,.mts,.m2ts,.ts,.tiff,.tif,.bmp,.heic,.heif"
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                  disabled={submitting} />
                {file ? (
                  <div>
                    <div style={{ fontWeight: 600, color: '#7DC242', marginBottom: '4px' }}>✓ {file.name}</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}</div>
                  </div>
                ) : (
                  <div>
                    <i className="ti ti-cloud-upload" style={{ fontSize: '28px', display: 'block', marginBottom: '8px', color: '#C0DD97' }} />
                    <div style={{ color: '#888', marginBottom: '4px', fontSize: '13px' }}>Drag & drop or click to upload</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>MP4, MOV, AVI, MKV, JPG, PNG, PDF, PSD, AI, ZIP · max 600MB</div>
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label className="field-label">Notes to PM <span style={{ color: '#aaa', textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="field-textarea" placeholder="Any context for the PM…" value={notes} onChange={e => setNotes(e.target.value)} disabled={submitting} />
            </div>
          </div>

          <div>
            <div className="field">
              <label className="field-label">Pre-Submission Checklist <span style={{ color: '#aaa', textTransform: 'none', fontSize: '11px', fontWeight: 400 }}>(recommended)</span></label>
              <div className="card-sm" style={{ padding: '0' }}>
                {getChecklistSections(user?.designerType).map(section => (
                  <div key={section.section}>
                    <div style={{ padding: '8px 14px 4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      {section.section}
                    </div>
                    {section.items.map(item => (
                      <div key={item} className="check-item" onClick={() => !submitting && toggleCheck(item)} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                        <div className={`checkbox ${checklist.includes(item) ? 'checked' : ''}`} style={{ flexShrink: 0 }}>{checklist.includes(item) && '✓'}</div>
                        <span style={{ fontSize: '12px', color: checklist.includes(item) ? 'var(--text2)' : 'var(--text)' }}>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--text3)', textAlign: 'right' }}>
                  {checklist.length} / {getChecklistSections(user?.designerType).flatMap(s => s.items).length} checked
                </div>
              </div>
            </div>

            {selectedTask && file && (
              <div className="drive-path">
                📁 makers-studio / {selectedTask.clientName} / {selectedTask.name} / {selectedTask.name} - draft?.{file.name.split('.').pop()}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-red" style={{ marginTop: '12px' }}>
            <i className="ti ti-alert-circle" style={{ fontSize: '16px', flexShrink: 0 }} />
            {error}
          </div>
        )}

        {submitting && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: 'var(--text2)' }}>
              <span>{uploadStep}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px', transition: 'width .2s' }} />
            </div>
            {file && (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB · uploading to DO Spaces
              </div>
            )}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          {submitting ? (
            <button className="btn btn-sm btn-danger" onClick={cancel}>Cancel Upload</button>
          ) : (
            <a href="/designer/tasks" className="btn">Cancel</a>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={!selectedTask || !file || submitting}>
            {submitting
              ? <><span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> {uploadStep || 'Uploading…'}</>
              : <><i className="ti ti-upload" /> Submit Work</>
            }
          </button>
        </div>
      </div>
    </>
  )
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <SubmitForm />
    </Suspense>
  )
}
