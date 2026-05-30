'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, CHECKLIST_ITEMS } from '@/lib/types'

const DESIGNER_TABS = [
  { label: 'My Tasks', href: '/designer/tasks', icon: 'ti-list-check' },
  { label: 'Submit Work', href: '/designer/submit', icon: 'ti-upload' },
  { label: 'My Submissions', href: '/designer/submissions', icon: 'ti-history' },
]

function SubmitForm() {
  const [user, setUser] = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [checklist, setChecklist] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [drag, setDrag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const [result, setResult] = useState<{ storagePath: string; version: number; viewUrl: string } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
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

  async function submit() {
    if (!selectedTask || !file) { setError('Please select a task and upload a file.'); return }
    setSubmitting(true); setError(''); setUploadStep('Preparing upload…')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('taskId', selectedTask.id)
    fd.append('taskName', selectedTask.name)
    fd.append('clientId', selectedTask.clientId)
    fd.append('deliverableType', selectedTask.deliverableType)
    fd.append('checklist', JSON.stringify(checklist))
    fd.append('notes', notes)

    const stepTimer = setTimeout(() => setUploadStep('Uploading to Supabase Storage…'), 1500)
    const stepTimer2 = setTimeout(() => setUploadStep('Saving submission record…'), 8000)

    try {
      const res = await fetch('/api/submissions', { method: 'POST', body: fd })
      clearTimeout(stepTimer); clearTimeout(stepTimer2)

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Upload failed. Please try again.')
        setSubmitting(false); setUploadStep('')
        return
      }

      const data = await res.json()
      setSubmitting(false); setUploadStep('')
      setResult({ storagePath: data.storagePath, version: data.version, viewUrl: data.viewUrl })

    } catch (err) {
      clearTimeout(stepTimer); clearTimeout(stepTimer2)
      setError('Network error — check your connection and try again.')
      setSubmitting(false); setUploadStep('')
      console.error(err)
    }
  }

  function reset() {
    setSelectedTaskId(''); setFile(null); setChecklist([]); setNotes(''); setResult(null); setError('')
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
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
              v{result.version} uploaded. PM will review shortly.
            </div>
            <div className="drive-path">📁 {result.storagePath}</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
              {result.viewUrl && result.viewUrl !== '#' && (
                <a href={result.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm">View File ↗</a>
              )}
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
        <div className="section-header">
          <div className="section-title">Submit Work</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div className="field">
              <label className="field-label">Task *</label>
              <select className="field-select" value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)} disabled={submitting}>
                <option value="">Select a task…</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.name} — {t.clientName}</option>
                ))}
              </select>
            </div>

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
              <label className="field-label">File * <span style={{ color: '#aaa', textTransform: 'none', fontSize: '11px', fontWeight: 400 }}>(photo or video, any format)</span></label>
              <div
                className={`upload-zone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => !submitting && fileRef.current?.click()}
                style={{ opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                <input ref={fileRef} type="file" style={{ display: 'none' }} accept="image/*,video/*"
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} disabled={submitting} />
                {file ? (
                  <div>
                    <div style={{ fontWeight: 600, color: '#7DC242', marginBottom: '4px' }}>✓ {file.name}</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}</div>
                  </div>
                ) : (
                  <div>
                    <i className="ti ti-cloud-upload" style={{ fontSize: '28px', display: 'block', marginBottom: '8px', color: '#C0DD97' }} />
                    <div style={{ color: '#888', marginBottom: '4px', fontSize: '13px' }}>Drag & drop or click to upload</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>MP4, MOV, JPG, PNG, WEBP and more</div>
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
                    <div className={`checkbox ${checklist.includes(item) ? 'checked' : ''}`}>
                      {checklist.includes(item) && '✓'}
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {selectedTask && file && (
              <div className="drive-path">
                📁 {selectedTask.clientName} / {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} / {file.type.startsWith('video/') ? 'Videos' : 'Photos'} / {selectedTask.name} - v?.{file.name.split('.').pop()}
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
          <div className="alert alert-green" style={{ marginTop: '12px' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #C0DD97', borderTopColor: '#7DC242', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
            <span>{uploadStep || 'Uploading…'}</span>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <a href="/designer/tasks" className="btn" style={{ pointerEvents: submitting ? 'none' : 'auto', opacity: submitting ? 0.5 : 1 }}>Cancel</a>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!selectedTask || !file || submitting}
          >
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
