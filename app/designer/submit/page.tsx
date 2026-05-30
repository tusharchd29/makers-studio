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
  const [result, setResult] = useState<{ drivePath: string; version: number; driveViewUrl: string } | null>(null)
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
    setSubmitting(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('taskId', selectedTask.id)
    fd.append('taskName', selectedTask.name)
    fd.append('clientId', selectedTask.clientId)
    fd.append('deliverableType', selectedTask.deliverableType)
    fd.append('checklist', JSON.stringify(checklist))
    fd.append('notes', notes)
    const res = await fetch('/api/submissions', { method: 'POST', body: fd })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(data.error || 'Upload failed'); return }
    setResult({ drivePath: data.drivePath, version: data.version, driveViewUrl: data.driveViewUrl })
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
          <div className="card" style={{ textAlign: 'center', padding: '36px', maxWidth: '440px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px', color: 'var(--green)' }}>Submitted!</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
              v{result.version} uploaded successfully. PM will review shortly.
            </div>
            <div className="drive-path">{result.drivePath}</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              {result.driveViewUrl !== '#' && (
                <a href={result.driveViewUrl} target="_blank" rel="noreferrer" className="btn btn-sm">View in Drive ↗</a>
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
              <select className="field-select" value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)}>
                <option value="">Select a task…</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.name} — {t.clientName}</option>
                ))}
              </select>
            </div>

            {selectedTask && (
              <div className="card-sm" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span className="tag">{selectedTask.deliverableType}</span>
                  <span className="tag">Due {new Date(selectedTask.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                {selectedTask.brief && <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{selectedTask.brief}</div>}
              </div>
            )}

            <div className="field">
              <label className="field-label">File * <span style={{ color: 'var(--text3)', textTransform: 'none', fontSize: '11px' }}>(photo or video, any format — no compression)</span></label>
              <div
                className={`upload-zone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" style={{ display: 'none' }} accept="image/*,video/*"
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                {file ? (
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--accent)', marginBottom: '4px' }}>✓ {file.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>↑</div>
                    <div style={{ color: 'var(--text2)', marginBottom: '4px' }}>Drag & drop or click to upload</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>MP4, MOV, JPG, PNG, WEBP and more</div>
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label className="field-label">Notes to PM <span style={{ color: 'var(--text3)', textTransform: 'none' }}>(optional)</span></label>
              <textarea className="field-textarea" placeholder="Any context for the PM…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="field">
              <label className="field-label">Checklist <span style={{ color: 'var(--text3)', textTransform: 'none', fontSize: '11px' }}>(optional — check what applies)</span></label>
              <div className="card-sm">
                {CHECKLIST_ITEMS.map(item => (
                  <div key={item} className="check-item" onClick={() => toggleCheck(item)}>
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
                📁 Makers Studio / {tasks.find(t => t.id === selectedTaskId)?.clientName} / {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} / {file.type.startsWith('video/') ? 'Videos' : 'Photos'} / {selectedTask.name} - v?.{file.name.split('.').pop()}
              </div>
            )}
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <a href="/designer/tasks" className="btn">Cancel</a>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!selectedTask || !file || submitting}
          >
            {submitting ? 'Uploading…' : '↑ Submit to Drive'}
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
