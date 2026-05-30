'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

const DESIGNER_TABS = [
  { label: 'My Tasks', href: '/designer/tasks', icon: 'ti-list-check' },
  { label: 'Submit Work', href: '/designer/submit', icon: 'ti-upload' },
  { label: 'My Submissions', href: '/designer/submissions', icon: 'ti-history' },
]

interface Submission {
  id: string; taskId: string; taskName: string; clientName: string
  deliverableType: string; fileType: string; fileName: string
  version: string; status: string; pmComment: string
  storagePath: string; viewUrl: string; submittedAt: string; notes: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'Pending Review', color: '#ff9b4e', bg: '#ff9b4e18', icon: '⏳' },
  approved: { label: 'Approved',       color: '#4ede8c', bg: '#4ede8c18', icon: '✅' },
  revision: { label: 'Needs Revision', color: '#5b9cf6', bg: '#5b9cf618', icon: '↩' },
  rejected: { label: 'Rejected',       color: '#ff5f5f', bg: '#ff5f5f18', icon: '✕' },
}

export default function MySubmissionsPage() {
  const [user, setUser] = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const router = useRouter()

  const [revisions, setRevisions] = useState<Record<string, {draftNumber: number; viewUrl: string; fileName: string; pmComment: string; status: string; submittedAt: string}[]>>({})

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'designer') { router.push('/pm/dashboard'); return }
    setUser(u)
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setSubmissions(data)
        // For tasks in revision/rejected — fetch full revision history
        const needsHistory = data.filter((s: {status: string; taskId: string}) => s.status === 'revision' || s.status === 'rejected')
        needsHistory.forEach((s: {taskId: string}) => {
          fetch(`/api/revisions?taskId=${s.taskId}`).then(r => r.json()).then(revs => {
            if (Array.isArray(revs)) {
              setRevisions(prev => ({ ...prev, [s.taskId]: revs }))
            }
          })
        })
      }
      setLoading(false)
    })
  }, [router])

  if (!user) return null

  const needsAction = submissions.filter(s => s.status === 'revision' || s.status === 'rejected')
  const filtered = filter === 'all' ? submissions : submissions.filter(s => s.status === filter)

  return (
    <>
      <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/submissions" tabs={DESIGNER_TABS} />
      <div className="page">

        {/* Action Required Banner */}
        {needsAction.length > 0 && (
          <div style={{
            background: '#5b9cf618', border: '1px solid #5b9cf640',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: '18px', color: '#5b9cf6', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#5b9cf6', fontSize: '13px' }}>
                {needsAction.length} submission{needsAction.length > 1 ? 's' : ''} need{needsAction.length === 1 ? 's' : ''} your attention
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                {needsAction.map(s => s.taskName).join(', ')} — check PM feedback below and resubmit
              </div>
            </div>
          </div>
        )}

        <div className="section-header">
          <div className="section-title">My Submissions</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['all', 'pending', 'revision', 'approved', 'rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: filter === f ? 'var(--accent)' : 'var(--surface2)',
                  color: filter === f ? '#fff' : 'var(--text2)',
                  textTransform: 'capitalize',
                }}>
                {f === 'all' ? `All (${submissions.length})` : `${f} (${submissions.filter(s => s.status === f).length})`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {filter === 'all'
              ? <>No submissions yet.<br /><a href="/designer/submit" style={{ color: 'var(--accent)' }}>Submit your first work →</a></>
              : `No ${filter} submissions.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(s => {
              const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending
              const needsWork = s.status === 'revision' || s.status === 'rejected'
              return (
                <div key={s.id} className="card" style={{
                  padding: '16px',
                  borderLeft: `3px solid ${cfg.color}`,
                  ...(needsWork ? { boxShadow: `0 0 0 1px ${cfg.color}40` } : {}),
                }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{s.taskName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{s.clientName}</span>
                        <span className="tag">{s.deliverableType}</span>
                        <span className="tag">{s.version}</span>
                        <span style={{ color: 'var(--text3)' }}>
                          {new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    {/* Status badge */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '4px 10px', borderRadius: '20px',
                      background: cfg.bg, color: cfg.color,
                      fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {cfg.icon} {cfg.label}
                    </div>
                  </div>

                  {/* PM Feedback — most prominent when needs action */}
                  {s.pmComment && (
                    <div style={{
                      marginTop: '12px', padding: '12px 14px',
                      background: needsWork ? cfg.bg : 'var(--surface2)',
                      border: `1px solid ${needsWork ? cfg.color + '50' : 'var(--border)'}`,
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        PM Feedback
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                        {s.pmComment}
                      </div>
                    </div>
                  )}

                  {/* Draft history for revision tasks */}
                  {needsWork && revisions[s.taskId] && revisions[s.taskId].length > 1 && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => setExpandedHistory(expandedHistory === s.taskId ? null : s.taskId)}
                        style={{ fontSize: '11px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      >
                        {expandedHistory === s.taskId ? 'Hide' : 'Show'} all {revisions[s.taskId].length} drafts
                      </button>
                      {expandedHistory === s.taskId && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {revisions[s.taskId].map(rev => (
                            <div key={rev.draftNumber} style={{
                              padding: '8px 10px', borderRadius: '8px',
                              background: rev.draftNumber === s.draftNumber ? 'var(--surface2)' : 'transparent',
                              border: '1px solid var(--border)', fontSize: '12px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: rev.pmComment ? '4px' : 0 }}>
                                <span style={{ fontWeight: 700 }}>Draft {rev.draftNumber}</span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                                    {new Date(rev.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </span>
                                  {rev.viewUrl && (
                                    <a href={rev.viewUrl} target="_blank" rel="noreferrer"
                                      style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                                      View ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                              {rev.pmComment && (
                                <div style={{ fontSize: '11px', color: STATUS_CONFIG[rev.status]?.color || 'var(--text3)', marginTop: '3px' }}>
                                  PM: {rev.pmComment}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resubmit CTA for revision/rejected */}
                  {needsWork && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <a
                        href={`/designer/submit?taskId=${s.taskId}`}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        <i className="ti ti-upload" style={{ fontSize: '13px' }} />
                        {s.status === 'revision' ? 'Submit Revised Version' : 'Resubmit'}
                      </a>
                      {s.viewUrl && s.viewUrl !== '#' && (
                        <a href={s.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm"
                          style={{ fontSize: '11px' }}>
                          View Previous ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* View link for approved */}
                  {s.status === 'approved' && s.viewUrl && s.viewUrl !== '#' && (
                    <div style={{ marginTop: '10px' }}>
                      <a href={s.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm"
                        style={{ fontSize: '11px' }}>
                        View Approved File ↗
                      </a>
                    </div>
                  )}

                  {/* Storage path */}
                  {s.storagePath && (
                    <div className="drive-path" style={{ marginTop: '8px', fontSize: '10px' }}>📁 {s.storagePath}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
