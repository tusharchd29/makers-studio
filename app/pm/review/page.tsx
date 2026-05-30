'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

const PM_TABS = [
  { label: 'Dashboard', href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review', icon: 'ti-eye-check' },
  { label: 'Tasks', href: '/pm/tasks', icon: 'ti-checklist' },
  { label: 'SOW', href: '/pm/sow', icon: 'ti-file-description' },
  { label: 'Clients', href: '/pm/clients', icon: 'ti-building' },
]

interface Submission {
  id: string; taskName: string; clientName: string; designerName: string
  deliverableType: string; fileType: string; fileName: string; version: string
  status: string; pmComment: string; viewUrl: string; storagePath: string
  checklist: string; notes: string; submittedAt: string
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', revision: 'badge-revision' }
  return <span className={`badge ${map[s] || 'badge-neutral'}`}>{s}</span>
}

function FilePreview({ submission }: { submission: Submission }) {
  const [expanded, setExpanded] = useState(false)
  const isVideo = submission.fileType === 'videos' || submission.fileType === 'video' ||
    submission.fileName?.match(/\.(mp4|mov|avi|webm|mkv)$/i) !== null

  if (!submission.viewUrl || submission.viewUrl === '#') return null

  return (
    <div style={{ marginTop: '10px' }}>
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text2)',
          }}
        >
          <i className={`ti ${isVideo ? 'ti-player-play' : 'ti-photo'}`} style={{ fontSize: '14px', color: 'var(--accent)' }} />
          {isVideo ? 'Preview Video' : 'Preview Image'} — {submission.fileName}
        </button>
      ) : (
        <div style={{
          borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)',
          background: '#000', position: 'relative', maxWidth: '480px',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 10px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{submission.fileName}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <a href={submission.viewUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                Open full ↗
              </a>
              <button onClick={() => setExpanded(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '14px', padding: '0 2px' }}>
                ✕
              </button>
            </div>
          </div>
          {isVideo ? (
            <video
              controls autoPlay={false}
              style={{ width: '100%', maxHeight: '320px', display: 'block' }}
              src={submission.viewUrl}
            >
              Your browser does not support video.
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={submission.viewUrl}
              alt={submission.fileName}
              style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', display: 'block', background: '#111' }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function PMReviewPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState({ client: '', designer: '', status: 'pending' })
  const [commenting, setCommenting] = useState<string | null>(null)
  const [commentAction, setCommentAction] = useState<'revision' | 'rejected' | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setSubmissions(data)
      setLoading(false)
    })
  }, [router])

  async function review(id: string, status: string) {
    setSaving(true)
    await fetch('/api/submissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: id, status, pmComment: comment }),
    })
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status, pmComment: comment } : s))
    setCommenting(null); setCommentAction(null); setComment(''); setSaving(false)
  }

  if (!user) return null

  const clients = [...new Set(submissions.map(s => s.clientName))]
  const designers = [...new Set(submissions.map(s => s.designerName))]

  const filtered = submissions.filter(s => {
    if (filter.client && s.clientName !== filter.client) return false
    if (filter.designer && s.designerName !== filter.designer) return false
    if (filter.status && s.status !== filter.status) return false
    return true
  })

  const pendingCount = submissions.filter(s => s.status === 'pending').length

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/review" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Review Queue</div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
            {pendingCount > 0 && <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{pendingCount} pending · </span>}
            {filtered.length} shown
          </span>
        </div>

        {/* Filters */}
        <div className="row" style={{ marginBottom: '16px' }}>
          <select className="field-select col" value={filter.client} onChange={e => setFilter(f => ({ ...f, client: e.target.value }))}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="field-select col" value={filter.designer} onChange={e => setFilter(f => ({ ...f, designer: e.target.value }))}>
            <option value="">All designers</option>
            {designers.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="field-select col" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="revision">Revision</option>
          </select>
        </div>

        {loading ? (
          <div className="empty">Loading submissions…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {filter.status === 'pending' ? '🎉 No pending submissions!' : 'Nothing matches these filters.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map(s => (
              <div key={s.id} className="card" style={{ padding: '16px' }}>

                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{s.taskName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{s.clientName}</span>
                      <span>·</span>
                      <span>by <strong>{s.designerName}</strong></span>
                      <span>·</span>
                      <span className="tag">{s.deliverableType}</span>
                      <span className="tag">{s.version}</span>
                      <span style={{ color: 'var(--text3)' }}>
                        {new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <StatusBadge s={s.status} />
                </div>

                {/* Notes & checklist */}
                {s.notes && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic', marginBottom: '6px', padding: '6px 10px', background: 'var(--surface2)', borderRadius: '6px' }}>
                    💬 "{s.notes}"
                  </div>
                )}
                {s.checklist && (
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>✓ {s.checklist}</div>
                )}

                {/* Inline file preview */}
                <FilePreview submission={s} />

                {/* PM comment (if reviewed) */}
                {s.pmComment && (
                  <div className="comment-box" style={{ marginTop: '8px' }}>
                    <strong>PM note:</strong> {s.pmComment}
                  </div>
                )}

                {/* Action buttons — only for pending */}
                {s.status === 'pending' && commenting !== s.id && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-success" disabled={saving}
                      onClick={() => { setComment(''); review(s.id, 'approved') }}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm btn-warning" disabled={saving}
                      onClick={() => { setCommenting(s.id); setCommentAction('revision'); setComment('') }}>
                      ↩ Request Revision
                    </button>
                    <button className="btn btn-sm btn-danger" disabled={saving}
                      onClick={() => { setCommenting(s.id); setCommentAction('rejected'); setComment('') }}>
                      ✕ Reject
                    </button>
                  </div>
                )}

                {/* Comment box */}
                {commenting === s.id && (
                  <div style={{ marginTop: '10px', background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px' }}>
                    <div className="field-label" style={{ marginBottom: '6px' }}>
                      {commentAction === 'revision' ? '↩ What needs to change?' : '✕ Why is this rejected?'}
                    </div>
                    <textarea className="field-textarea" style={{ minHeight: '64px', marginBottom: '8px' }}
                      placeholder="Designer will see this message…"
                      value={comment} onChange={e => setComment(e.target.value)} autoFocus />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {commentAction === 'revision' && (
                        <button className="btn btn-sm btn-warning" disabled={saving || !comment.trim()}
                          onClick={() => review(s.id, 'revision')}>
                          Send for Revision
                        </button>
                      )}
                      {commentAction === 'rejected' && (
                        <button className="btn btn-sm btn-danger" disabled={saving || !comment.trim()}
                          onClick={() => review(s.id, 'rejected')}>
                          Confirm Reject
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => { setCommenting(null); setCommentAction(null) }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Storage path */}
                {s.storagePath && (
                  <div className="drive-path" style={{ marginTop: '8px', fontSize: '10px' }}>📁 {s.storagePath}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
