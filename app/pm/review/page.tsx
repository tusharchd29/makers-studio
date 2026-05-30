'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
  { label: 'Clients',      href: '/pm/clients',   icon: 'ti-building' },
]

interface Submission {
  id: string; taskId: string; taskName: string; clientName: string; designerName: string
  deliverableType: string; fileType: string; fileName: string; version: string
  draftNumber: number; status: string; pmComment: string; designerNote: string
  viewUrl: string; storagePath: string; checklist: string; notes: string; submittedAt: string
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#ff9b4e', bg: '#ff9b4e20' },
  approved: { label: 'Approved', color: '#4ede8c', bg: '#4ede8c20' },
  revision: { label: 'Revision', color: '#5b9cf6', bg: '#5b9cf620' },
  rejected: { label: 'Rejected', color: '#ff5f5f', bg: '#ff5f5f20' },
}

function StatusBadge({ s }: { s: string }) {
  const m = STATUS_META[s] || { label: s, color: '#aaa', bg: '#aaa20' }
  return (
    <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function FilePreview({ s }: { s: Submission }) {
  const [open, setOpen] = useState(false)
  const isVideo = s.fileType === 'videos' || s.fileType === 'video' || /\.(mp4|mov|avi|webm|mkv)$/i.test(s.fileName || '')
  if (!s.viewUrl || s.viewUrl === '#') return null
  return (
    <div style={{ marginTop: '8px' }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '5px 12px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: '8px',
          cursor: 'pointer', fontSize: '12px', color: 'var(--text2)',
        }}>
          <i className={`ti ${isVideo ? 'ti-player-play' : 'ti-photo'}`} style={{ color: 'var(--accent)' }} />
          {isVideo ? 'Preview Video' : 'Preview Image'}
        </button>
      ) : (
        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', maxWidth: '500px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface2)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{s.fileName}</span>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <a href={s.viewUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>Open ↗</a>
              <a href={s.viewUrl} download={s.fileName} style={{ fontSize: '11px', color: 'var(--text2)', textDecoration: 'none' }}>⬇ Download</a>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
            </div>
          </div>
          {isVideo
            ? <video controls style={{ width: '100%', maxHeight: '340px', display: 'block', background: '#000' }} src={s.viewUrl} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={s.viewUrl} alt={s.fileName} style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block', background: '#111' }} />
          }
        </div>
      )}
    </div>
  )
}

function SubmissionCard({ s, onReview, drafts }: { s: Submission; onReview: (id: string, status: string, comment: string) => Promise<void>; drafts?: {draftNumber: number; viewUrl: string; fileName: string; pmComment: string; designerNote: string; submittedAt: string; status: string}[] }) {
  const [commenting, setCommenting] = useState(false)
  const [action, setAction] = useState<'revision' | 'rejected' | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  async function doReview(status: string) {
    setSaving(true)
    await onReview(s.id, status, comment)
    setSaving(false)
    setCommenting(false)
    setAction(null)
    setComment('')
  }

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${STATUS_META[s.status]?.color || '#eee'}`,
    }}>
      {/* Title + meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '3px' }}>{s.taskName}</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.clientName}</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span>by <strong>{s.designerName}</strong></span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span className="tag">{s.deliverableType}</span>
            <span className="tag">{s.version}</span>
            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>
              {new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <StatusBadge s={s.status} />
      </div>

      {/* Notes */}
      {s.notes && (
        <div style={{ marginTop: '8px', fontSize: '12px', fontStyle: 'italic', color: 'var(--text2)', padding: '6px 10px', background: 'var(--surface2)', borderRadius: '6px' }}>
          💬 {s.notes}
        </div>
      )}
      {s.checklist && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text3)' }}>✓ {s.checklist}</div>
      )}

      {/* File preview */}
      <FilePreview s={s} />

      {/* Previous drafts — PM can compare all versions */}
      {drafts && drafts.length > 1 && (
        <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Draft History ({drafts.length} versions)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {drafts.map(d => (
              <div key={d.draftNumber} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '6px 8px',
                borderRadius: '6px', border: '1px solid var(--border)',
                background: d.draftNumber === s.draftNumber ? '#5b9cf610' : 'transparent',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: d.draftNumber === s.draftNumber ? '#5b9cf6' : 'var(--text3)', minWidth: '54px' }}>
                  Draft {d.draftNumber}{d.draftNumber === s.draftNumber ? ' ★' : ''}
                </span>
                <div style={{ flex: 1, fontSize: '11px', color: 'var(--text2)' }}>
                  {d.designerNote && <div style={{ fontStyle: 'italic', marginBottom: '2px' }}>Designer: {d.designerNote}</div>}
                  {d.pmComment && <div style={{ color: STATUS_META[d.status]?.color || 'var(--text3)' }}>PM: {d.pmComment}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                    {new Date(d.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  {d.viewUrl && (
                    <a href={d.viewUrl} target="_blank" rel="noreferrer"
                      style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous PM comment */}
      {s.pmComment && (
        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--surface2)', borderRadius: '6px', fontSize: '12px' }}>
          <span style={{ fontWeight: 700, color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PM note · </span>
          {s.pmComment}
        </div>
      )}

      {/* Actions */}
      {s.status === 'pending' && !commenting && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-success" disabled={saving} onClick={() => doReview('approved')}>✓ Approve</button>
          <button className="btn btn-sm btn-warning" disabled={saving} onClick={() => { setCommenting(true); setAction('revision') }}>↩ Request Revision</button>
          <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => { setCommenting(true); setAction('rejected') }}>✕ Reject</button>
        </div>
      )}

      {commenting && (
        <div style={{ marginTop: '10px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: action === 'revision' ? '#5b9cf6' : '#ff5f5f' }}>
            {action === 'revision' ? '↩ What needs to change? (required)' : '✕ Reason for rejection (required)'}
          </div>
          <textarea className="field-textarea" style={{ minHeight: '60px', marginBottom: '8px' }}
            placeholder="Designer will see this message…"
            value={comment} onChange={e => setComment(e.target.value)} autoFocus />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${action === 'revision' ? 'btn-warning' : 'btn-danger'}`}
              disabled={saving || !comment.trim()}
              onClick={() => doReview(action!)}>
              {saving ? '…' : action === 'revision' ? 'Send for Revision' : 'Confirm Reject'}
            </button>
            <button className="btn btn-sm" onClick={() => { setCommenting(false); setAction(null); setComment('') }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PMReviewPage() {
  const [user, setUser]           = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus]     = useState('pending')
  const [filterClient, setFilterClient]     = useState('')
  const [filterDesigner, setFilterDesigner] = useState('')
  const [filterMonth, setFilterMonth]       = useState('')
  const [groupBy, setGroupBy]     = useState<'none' | 'client' | 'month'>('client')
  const router = useRouter()

  const [revisions, setRevisions] = useState<Record<string, {draftNumber: number; viewUrl: string; fileName: string; pmComment: string; designerNote: string; status: string; submittedAt: string}[]>>({})

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setSubmissions(data)
        // Fetch revision history for all tasks with multiple drafts
        data.forEach((s: {taskId: string; draftNumber: number}) => {
          if (s.draftNumber > 1) {
            fetch(`/api/revisions?taskId=${s.taskId}`).then(r => r.json()).then(revs => {
              if (Array.isArray(revs)) setRevisions(prev => ({ ...prev, [s.taskId]: revs }))
            })
          }
        })
      }
      setLoading(false)
    })
  }, [router])

  async function handleReview(id: string, status: string, comment: string) {
    await fetch('/api/submissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: id, status, pmComment: comment }),
    })
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status, pmComment: comment } : s))
  }

  // Derive filter options from data
  const months   = useMemo(() => [...new Set(submissions.map(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })))].sort().reverse(), [submissions])
  const clients  = useMemo(() => [...new Set(submissions.map(s => s.clientName))].sort(), [submissions])
  const designers = useMemo(() => [...new Set(submissions.map(s => s.designerName))].sort(), [submissions])

  // Stats
  const counts = useMemo(() => ({
    all: submissions.length,
    pending:  submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    revision: submissions.filter(s => s.status === 'revision').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  }), [submissions])

  // Filter
  const filtered = useMemo(() => submissions.filter(s => {
    if (filterStatus  && s.status      !== filterStatus)  return false
    if (filterClient  && s.clientName  !== filterClient)  return false
    if (filterDesigner && s.designerName !== filterDesigner) return false
    if (filterMonth) {
      const m = new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })
      if (m !== filterMonth) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!s.taskName.toLowerCase().includes(q) &&
          !s.clientName.toLowerCase().includes(q) &&
          !s.designerName.toLowerCase().includes(q)) return false
    }
    return true
  }), [submissions, filterStatus, filterClient, filterDesigner, filterMonth, search])

  // Group
  const grouped = useMemo(() => {
    if (groupBy === 'none') return { 'All': filtered }
    const key = groupBy === 'client'
      ? (s: Submission) => s.clientName
      : (s: Submission) => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const map: Record<string, Submission[]> = {}
    filtered.forEach(s => {
      const k = key(s)
      if (!map[k]) map[k] = []
      map[k].push(s)
    })
    return map
  }, [filtered, groupBy])

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/review" tabs={PM_TABS} />
      <div className="page">

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['all', 'pending', 'approved', 'revision', 'rejected'] as const).map(st => {
            const m = st === 'all' ? { color: 'var(--text2)', bg: 'var(--surface2)' } : STATUS_META[st]
            const active = filterStatus === st || (st === 'all' && !filterStatus)
            return (
              <button key={st} onClick={() => setFilterStatus(st === 'all' ? '' : st)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', border: `1px solid ${active ? m.color : 'var(--border)'}`,
                  background: active ? (st === 'all' ? 'var(--surface2)' : m.bg) : 'transparent',
                  color: active ? (st === 'all' ? 'var(--text)' : m.color) : 'var(--text3)',
                  fontWeight: active ? 700 : 400, fontSize: '12px', cursor: 'pointer', transition: 'all .15s',
                }}>
                {st === 'all' ? 'All' : STATUS_META[st].label} ({counts[st === 'all' ? 'all' : st]})
              </button>
            )
          })}
        </div>

        {/* Filter + Search bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '160px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '14px' }} />
            <input className="field-input" placeholder="Search task, client, designer…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '32px', width: '100%' }} />
          </div>

          {/* Month */}
          <select className="field-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ minWidth: '160px' }}>
            <option value="">All months</option>
            {months.map(m => <option key={m}>{m}</option>)}
          </select>

          {/* Client */}
          <select className="field-select" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ minWidth: '160px' }}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>

          {/* Designer */}
          <select className="field-select" value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)} style={{ minWidth: '140px' }}>
            <option value="">All designers</option>
            {designers.map(d => <option key={d}>{d}</option>)}
          </select>

          {/* Group by */}
          <select className="field-select" value={groupBy} onChange={e => setGroupBy(e.target.value as 'none' | 'client' | 'month')} style={{ minWidth: '130px' }}>
            <option value="client">Group: Client</option>
            <option value="month">Group: Month</option>
            <option value="none">No grouping</option>
          </select>

          {/* Clear filters */}
          {(search || filterClient || filterDesigner || filterMonth) && (
            <button className="btn btn-sm" onClick={() => { setSearch(''); setFilterClient(''); setFilterDesigner(''); setFilterMonth('') }}>
              Clear ✕
            </button>
          )}
        </div>

        {/* Result count */}
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
          Showing <strong>{filtered.length}</strong> of {submissions.length} submissions
          {filterMonth && ` · ${filterMonth}`}
          {filterClient && ` · ${filterClient}`}
          {filterDesigner && ` · ${filterDesigner}`}
        </div>

        {loading ? (
          <div className="empty">Loading submissions…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No submissions match these filters.</div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group} style={{ marginBottom: '20px' }}>
              {groupBy !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{group}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '2px 8px', background: 'var(--surface2)', borderRadius: '20px' }}>
                    {items.length} · {items.filter(s => s.status === 'pending').length} pending
                  </div>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {items.map(s => (
                  <SubmissionCard key={s.id} s={s} onReview={handleReview} drafts={revisions[s.taskId]} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
