'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, CHECKLIST_ITEMS } from '@/lib/types'

const DESIGNER_TABS = [
  { label: 'My Tasks',       href: '/designer/tasks',       icon: 'ti-list-check' },
  { label: 'Submit Work',    href: '/designer/submit',      icon: 'ti-upload' },
  { label: 'My Submissions', href: '/designer/submissions', icon: 'ti-history' },
]

function SubmitForm() {
  const [user, setUser]               = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [tasks, setTasks]             = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [file, setFile]               = useState<File | null>(null)
  const [checklist, setChecklist]     = useState<string[]>([])
  const [notes, setNotes]             = useState('')
  const [drag, setDrag]               = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [progress, setProgress]       = useState(0)
  const [uploadStep, setUploadStep]   = useState('')
  const [result, setResult]           = useState<{ draftNumber: number; viewUrl: string; fileName: string } | null>(null)
  const [error, setError]             = useState('')
  const [subStatusMap, setSubStatusMap] = useState<Record<string, string>>({})
  const fileRef   = useRef<HTMLInputElement>(null)
  const xhrRef    = useRef<XMLHttpRequest | null>(null)
  const router    = useRouter()
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

    setSubmitting(true); setError(''); setProgress(5); setUploadStep('Uploading to Drive…')

    try {
      const fd = new FormData()
      fd.append('file',            file)
      fd.append('taskId',          selectedTask.id)
      fd.append('taskName',        selectedTask.name)
      fd.append('clientName',      selectedTask.clientName)
      fd.append('deliverableType', selectedTask.deliverableType)
      fd.append('designerNote',    notes)

      // XHR so we can show upload progress
      const { draftNumber, viewUrl, fileName } = await new Promise<{ draftNumber: number; viewUrl: string; fileName: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90) + 5)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) }
            catch { reject(new Error('Invalid server response')) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error || `Upload failed: ${xhr.status}`)) }
            catch { reject(new Error(`Upload failed: ${xhr.status}`)) }
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))
        xhr.open('POST', '/api/submissions')
        xhr.send(fd)
      })

      setProgress(100); setUploadStep('Done!')
      setSubmitting(false)
      setResult({ draftNumber, viewUrl, fileName })
      router.refresh()

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
        <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="card" style={{ textAlign: 'center', padding: '36px', maxWidth: '440px', margin: '0 auto' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: '#3B6D11' }}>Submitted!</div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>Draft {result.draftNumber} uploaded to Google Drive. PM will review shortly.</div>
            <div className="drive-path">📁 {result.fileName}</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
              {result.viewUrl && <a href={result.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm">View in Drive ↗</a>}
              <button className="btn btn-sm btn-primary" onClick={reset}>Submit Another</button>
              <a href="/designer/tasks" className="btn btn-sm">My Tasks</a>
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
                {tasks.map(t => <option key={t.id} value={t.id}>{t.name} — {t.clientName}</option>)}
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
                {selectedTask.brief && <div style={{ fontSize: '12px', color: '#888' }}>{selectedTask.brief}</div>}
              </div>
            )}

            <div className="field">
              <label className="field-label">File *</label>
              <div
                className={`upload-zone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => !submitting && fileRef.current?.click()}
                style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                <input ref={fileRef} type="file" style={{ display: 'none' }}
                  accept="image/*,video/*"
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
                    <div style={{ fontSize: '11px', color: '#aaa' }}>MP4, MOV, JPG, PNG · uploaded to Google Drive</div>
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
              <label className="field-label">Checklist <span style={{ color: '#aaa', textTransform: 'none', fontSize: '11px', fontWeight: 400 }}>(optional)</span></label>
              <div className="card-sm">
                {CHECKLIST_ITEMS.map(item => (
                  <div key={item} className="check-item" onClick={() => !submitting && toggleCheck(item)}>
                    <div className={`checkbox ${checklist.includes(item) ? 'checked' : ''}`}>{checklist.includes(item) && '✓'}</div>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {selectedTask && file && (
              <div className="drive-path">
                📁 Drive / {selectedTask.clientName} / {selectedTask.name} / {selectedTask.name} - draft?.{file.name.split('.').pop()}
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
