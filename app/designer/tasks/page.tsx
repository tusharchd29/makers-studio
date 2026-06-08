'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task } from '@/lib/types'

const DESIGNER_TABS = [
  { label: 'My Tasks',        href: '/designer/tasks',       icon: 'ti-list-check' },
  { label: 'Submit Work',     href: '/designer/submit',      icon: 'ti-upload' },
  { label: 'My Submissions',  href: '/designer/submissions', icon: 'ti-history' },
]

function deadlineColor(d: string) {
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  if (diff < 0)   return 'var(--red)'
  if (diff <= 2)  return 'var(--orange)'
  return 'var(--text2)'
}

function deadlineLabel(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0)  return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  'not-submitted': { label: 'Not Submitted', color: 'var(--text3)', bg: 'var(--surface2)' },
  pending:         { label: 'In Review',     color: '#ff9b4e',      bg: '#ff9b4e20' },
  approved:        { label: 'Approved',      color: '#4ede8c',      bg: '#4ede8c20' },
  revision:        { label: 'Needs Revision',color: '#5b9cf6',      bg: '#5b9cf620' },
  rejected:        { label: 'Rejected',      color: '#ff5f5f',      bg: '#ff5f5f20' },
}

function StatusPill({ s }: { s: string }) {
  const m = STATUS_META[s] || STATUS_META['not-submitted']
  return <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span>
}

function DesignerTasksPageInner() {
  const [user, setUser] = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [subMap, setSubMap] = useState<Record<string, { status: string; pmComment: string; submissionId: string }>>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  const loadData = useCallback((userName: string) => {
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/submissions').then(r => r.json()),
    ]).then(([t, s]) => {
      if (Array.isArray(t)) setTasks(t.filter((task: Task) => task.assignedTo === userName))
      if (Array.isArray(s)) {
        const map: Record<string, { status: string; pmComment: string; submissionId: string; draftNumber: number }> = {}
        // Keep latest submission per task (highest draftNumber)
        s.forEach((sub: { taskId: string; status: string; pmComment: string; id: string; draftNumber: number }) => {
          const existing = map[sub.taskId]
          if (!existing || sub.draftNumber > (existing.draftNumber ?? 0)) {
            map[sub.taskId] = { status: sub.status, pmComment: sub.pmComment, submissionId: sub.id, draftNumber: sub.draftNumber }
          }
        })
        setSubMap(map)
      }
    })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'designer') { router.push('/pm/dashboard'); return }
    setUser(u)
    loadData(u.name)
  }, [router, loadData])

  // Re-fetch when returning from submit page
  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) return
    const u = JSON.parse(stored)
    if (searchParams.get('refresh')) loadData(u.name)
  }, [searchParams, loadData])

  const clients = useMemo(() => [...new Set(tasks.map(t => t.clientName))].sort(), [tasks])

  const filtered = useMemo(() => tasks.filter(t => {
    const status = subMap[t.id]?.status || 'not-submitted'
    if (filterStatus && status !== filterStatus) return false
    if (filterClient && t.clientName !== filterClient) return false
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.clientName.toLowerCase().includes(q)) return false
    }
    return true
  }), [tasks, subMap, filterStatus, filterClient, search])

  const needsAction = tasks.filter(t => {
    const s = subMap[t.id]?.status
    return s === 'revision' || s === 'rejected'
  })

  const counts = useMemo(() => ({
    all: tasks.length,
    'not-submitted': tasks.filter(t => !subMap[t.id]).length,
    pending:  tasks.filter(t => subMap[t.id]?.status === 'pending').length,
    revision: tasks.filter(t => subMap[t.id]?.status === 'revision').length,
    approved: tasks.filter(t => subMap[t.id]?.status === 'approved').length,
    rejected: tasks.filter(t => subMap[t.id]?.status === 'rejected').length,
  }), [tasks, subMap])

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [holdModal, setHoldModal] = useState<{ taskId: string; taskName: string } | null>(null)
  const [holdReasonInput, setHoldReasonInput] = useState('')

  async function updateTaskStatus(taskId: string, newStatus: string, holdReason?: string) {
    setUpdatingStatus(taskId)
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, taskStatus: newStatus, holdReason: holdReason || '' }),
      })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, taskStatus: newStatus as never, holdReason: holdReason || '' } : t))
    } finally {
      setUpdatingStatus(null)
    }
  }

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/tasks" tabs={DESIGNER_TABS} />
      <div className="page">

        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: '16px' }}>
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{counts.all}</div></div>
          <div className="stat-card"><div className="stat-label">To Submit</div><div className="stat-value" style={{ color: 'var(--text2)' }}>{counts['not-submitted']}</div></div>
          <div className="stat-card"><div className="stat-label">In Review</div><div className="stat-value" style={{ color: '#ff9b4e' }}>{counts.pending}</div></div>
          <div className="stat-card"><div className="stat-label">Needs Revision</div><div className="stat-value" style={{ color: '#5b9cf6' }}>{counts.revision}</div></div>
          <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value" style={{ color: '#4ede8c' }}>{counts.approved}</div></div>
        </div>

        {/* Action required banner */}
        {needsAction.length > 0 && (
          <div style={{ background: '#5b9cf618', border: '1px solid #5b9cf640', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="ti ti-alert-circle" style={{ color: '#5b9cf6', fontSize: '16px', flexShrink: 0 }} />
            <div style={{ fontSize: '13px' }}>
              <span style={{ fontWeight: 700, color: '#5b9cf6' }}>{needsAction.length} task{needsAction.length > 1 ? 's' : ''} need revision</span>
              <span style={{ color: 'var(--text2)', marginLeft: '6px' }}>{needsAction.map(t => t.name).join(', ')}</span>
            </div>
          </div>
        )}

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {[['', 'All'], ['not-submitted', 'To Submit'], ['pending', 'In Review'], ['revision', 'Revision'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([val, label]) => (
            <button key={val} onClick={() => setFilterStatus(val)}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                border: `1px solid ${filterStatus === val ? 'var(--accent)' : 'var(--border)'}`,
                background: filterStatus === val ? 'var(--accent)' : 'transparent',
                color: filterStatus === val ? '#fff' : 'var(--text3)', cursor: 'pointer',
              }}>
              {label} ({val === '' ? counts.all : counts[val as keyof typeof counts] || 0})
            </button>
          ))}
        </div>

        {/* Search + client filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '13px' }} />
            <input className="field-input" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '30px', width: '100%' }} />
          </div>
          <select className="field-select" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ minWidth: '150px' }}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>
          {(search || filterClient) && (
            <button className="btn btn-sm" onClick={() => { setSearch(''); setFilterClient('') }}>Clear ✕</button>
          )}
        </div>

        <div className="section-header">
          <div className="section-title">Tasks <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: '13px' }}>({filtered.length})</span></div>
          <a href="/designer/submit" className="btn btn-sm btn-primary">+ Submit Work</a>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">No tasks match these filters.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filtered.map(t => {
              const sub = subMap[t.id]
              const status = sub?.status || 'not-submitted'
              const needsWork = status === 'revision' || status === 'rejected'
              const canSubmit  = status === 'not-submitted' || needsWork
              const isLocked   = status === 'pending'
              return (
                <div key={t.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${STATUS_META[status]?.color || 'transparent'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t.priority && <span title="High Priority" style={{ color: '#ff9b4e', fontSize: '12px' }}>🔴</span>}
                        {t.name}
                        {/* Task workflow status badge */}
                        {t.taskStatus === 'hold' && (
                          <span style={{ padding: '1px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: '#ff9b4e18', color: '#ff9b4e' }}>⏸ On Hold</span>
                        )}
                        {t.taskStatus === 'processing' && (
                          <span style={{ padding: '1px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: '#5b9cf618', color: '#5b9cf6' }}>⚙ Processing</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{t.clientName}</span>
                        <span className="tag">{t.deliverableType}</span>
                        <span style={{ color: status === 'approved' ? '#4ede8c' : deadlineColor(t.deadline), fontWeight: 500 }}>
                          {status === 'approved' ? '✓ Approved' : deadlineLabel(t.deadline)}
                        </span>
                      </div>
                      {t.holdReason && t.taskStatus === 'hold' && (
                        <div style={{ marginTop: '6px', padding: '6px 10px', background: '#ff9b4e10', border: '1px solid #ff9b4e30', borderRadius: '6px', fontSize: '12px', color: '#ff9b4e' }}>
                          ⏸ On hold: {t.holdReason}
                        </div>
                      )}
                      {t.pmNotes && (
                        <div style={{ marginTop: '6px', padding: '6px 10px', background: '#5b9cf610', border: '1px solid #5b9cf630', borderRadius: '6px', fontSize: '12px', color: 'var(--text2)' }}>
                          <span style={{ fontWeight: 700, color: '#5b9cf6', fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>PM Notes</span>
                          {t.pmNotes}
                        </div>
                      )}
                      {t.brief && !t.pmNotes && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{t.brief}</div>}
                      {/* PM feedback inline */}
                      {sub?.pmComment && needsWork && (
                        <div style={{ marginTop: '8px', padding: '8px 10px', background: '#5b9cf618', border: '1px solid #5b9cf640', borderRadius: '6px', fontSize: '12px' }}>
                          <span style={{ fontWeight: 700, color: '#5b9cf6', fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>PM Feedback</span>
                          {sub.pmComment}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <StatusPill s={status} />
                      {canSubmit && (
                        <a href={`/designer/submit?taskId=${t.id}`} className={`btn btn-sm ${needsWork ? 'btn-warning' : 'btn-primary'}`} style={{ fontSize: '11px' }}>
                          {needsWork ? 'Resubmit' : 'Submit'}
                        </a>
                      )}
                      {isLocked && (
                        <span style={{ fontSize: '11px', color: 'var(--text3)', padding: '4px 8px', background: 'var(--surface2)', borderRadius: '6px' }}>
                          ⏳ Awaiting PM
                        </span>
                      )}
                      {/* Designer task status selector */}
                      {status !== 'approved' && (
                        <select
                          value={t.taskStatus || 'not-started'}
                          disabled={updatingStatus === t.id}
                          onChange={e => {
                            const val = e.target.value
                            if (val === 'hold') {
                              setHoldModal({ taskId: t.id, taskName: t.name })
                              setHoldReasonInput(t.holdReason || '')
                            } else {
                              updateTaskStatus(t.id, val)
                            }
                          }}
                          style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
                        >
                          <option value="not-started">Not Started</option>
                          <option value="processing">⚙ Processing</option>
                          <option value="hold">⏸ On Hold</option>
                          <option value="done">✓ Done</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Hold reason modal */}
        {holdModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(2px)' }}>
            <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>⏸ Put On Hold</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text2)' }}>{holdModal.taskName}</p>
              <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text3)' }}>Why is this on hold? PM will be notified.</p>
              <textarea
                value={holdReasonInput}
                onChange={e => setHoldReasonInput(e.target.value)}
                placeholder="e.g. Waiting for client assets, brief is unclear…"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '13px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  onClick={() => { setHoldModal(null); setHoldReasonInput('') }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' }}
                >Cancel</button>
                <button
                  disabled={!holdReasonInput.trim()}
                  onClick={() => {
                    updateTaskStatus(holdModal.taskId, 'hold', holdReasonInput.trim())
                    setHoldModal(null)
                    setHoldReasonInput('')
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: holdReasonInput.trim() ? '#ff9b4e' : '#ccc', color: '#fff', cursor: holdReasonInput.trim() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}
                >Confirm Hold</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

import { Suspense } from 'react'
export default function DesignerTasksPage() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <DesignerTasksPageInner />
    </Suspense>
  )
}
