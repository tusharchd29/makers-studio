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

export default function PMReviewPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState({ client: '', designer: '', status: 'pending' })
  const [commenting, setCommenting] = useState<string | null>(null)
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
    setCommenting(null); setComment(''); setSaving(false)
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

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/review" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Review Queue</div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{filtered.length} submissions</span>
        </div>

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

        {loading ? <div className="empty">Loading…</div> : filtered.length === 0 ? (
          <div className="empty">Nothing here. Try changing the filters.</div>
        ) : (
          <div className="card">
            {filtered.map(s => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '3px' }}>{s.taskName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span>{s.clientName}</span>
                      <span>by {s.designerName}</span>
                      <span className="tag">{s.deliverableType}</span>
                      <span className="tag">{s.version}</span>
                      <span style={{ color: 'var(--text3)' }}>{new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {s.notes && <div style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>"{s.notes}"</div>}
                    {s.checklist && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>✓ {s.checklist}</div>}
                    {s.pmComment && <div className="comment-box">PM: {s.pmComment}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', minWidth: '120px' }}>
                    <StatusBadge s={s.status} />
                    {s.viewUrl && s.viewUrl !== '#' && (
                      <a href={s.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: '11px' }}>View File ↗</a>
                    )}
                  </div>
                </div>

                {s.status === 'pending' && commenting !== s.id && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-success" disabled={saving} onClick={() => review(s.id, 'approved')}>✓ Approve</button>
                    <button className="btn btn-sm btn-warning" disabled={saving} onClick={() => { setCommenting(s.id); setComment('') }}>↩ Request Revision</button>
                    <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => { setCommenting(s.id); setComment('') }}>✕ Reject</button>
                  </div>
                )}

                {commenting === s.id && (
                  <div style={{ marginTop: '10px', background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '12px' }}>
                    <div className="field-label" style={{ marginBottom: '6px' }}>Comment for designer</div>
                    <textarea className="field-textarea" style={{ minHeight: '56px', marginBottom: '8px' }}
                      placeholder="Explain what needs to change…" value={comment}
                      onChange={e => setComment(e.target.value)} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-sm btn-warning" disabled={saving} onClick={() => review(s.id, 'revision')}>Send for Revision</button>
                      <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => review(s.id, 'rejected')}>Reject</button>
                      <button className="btn btn-sm" onClick={() => setCommenting(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {s.storagePath && <div className="drive-path" style={{ marginTop: '8px' }}>📁 {s.storagePath}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
