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
  id: string; taskName: string; clientName: string; deliverableType: string
  fileType: string; fileName: string; version: string; status: string
  pmComment: string; storagePath: string; viewUrl: string; submittedAt: string
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', revision: 'badge-revision' }
  return <span className={`badge ${map[s] || 'badge-neutral'}`}>{s}</span>
}

export default function MySubmissionsPage() {
  const [user, setUser] = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'designer') { router.push('/pm/dashboard'); return }
    setUser(u)
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setSubmissions(data)
      setLoading(false)
    })
  }, [router])

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/submissions" tabs={DESIGNER_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">My Submissions</div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{submissions.length} total</span>
        </div>

        {loading ? <div className="empty">Loading…</div> : submissions.length === 0 ? (
          <div className="empty">No submissions yet.<br /><a href="/designer/submit" style={{ color: 'var(--accent)' }}>Submit your first work →</a></div>
        ) : (
          <div className="card">
            {submissions.map(s => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '3px' }}>{s.taskName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{s.clientName}</span>
                      <span className="tag">{s.deliverableType}</span>
                      <span className="tag">{s.version}</span>
                      <span style={{ color: 'var(--text3)' }}>{new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {s.pmComment && (
                      <div className="comment-box" style={{ marginTop: '8px' }}>
                        <strong>PM:</strong> {s.pmComment}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <StatusBadge s={s.status} />
                    {s.viewUrl && s.viewUrl !== '#' && (
                      <a href={s.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: '11px' }}>View File ↗</a>
                    )}
                  </div>
                </div>
                {s.storagePath && <div className="drive-path" style={{ marginTop: '8px' }}>📁 {s.storagePath}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
