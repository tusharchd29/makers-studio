'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task } from '@/lib/types'

const DESIGNER_TABS = [
  { label: 'My Tasks', href: '/designer/tasks', icon: 'ti-list-check' },
  { label: 'Submit Work', href: '/designer/submit', icon: 'ti-upload' },
  { label: 'My Submissions', href: '/designer/submissions', icon: 'ti-history' },
]

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'badge-pending', approved: 'badge-approved',
    rejected: 'badge-rejected', revision: 'badge-revision',
  }
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>
}

function deadlineColor(deadline: string) {
  const d = new Date(deadline)
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'var(--red)'
  if (diff <= 2) return 'var(--orange)'
  return 'var(--text2)'
}

export default function DesignerTasksPage() {
  const [user, setUser] = useState<{ name: string; role: string; designerType?: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Record<string, string>>({})
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'designer') { router.push('/pm/dashboard'); return }
    setUser(u)
    fetch('/api/tasks').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTasks(data)
    })
    fetch('/api/submissions').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const map: Record<string, string> = {}
        data.forEach((s: { taskId: string; status: string; pmComment?: string }) => { map[s.taskId] = s.status })
        setSubmissions(map)
      }
    })
  }, [router])

  if (!user) return null

  const pending = tasks.filter(t => !submissions[t.id] || submissions[t.id] === 'pending')
  const needsRevision = tasks.filter(t => submissions[t.id] === 'revision' || submissions[t.id] === 'rejected')
  const approved = tasks.filter(t => submissions[t.id] === 'approved')

  return (
    <>
      <Topbar userName={user.name} userRole="designer" designerType={user.designerType as 'video' | 'graphic'} activeTab="/designer/tasks" tabs={DESIGNER_TABS} />
      <div className="page">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat-card"><div className="stat-label">Assigned</div><div className="stat-value">{tasks.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value" style={{ color: 'var(--orange)' }}>{pending.length}</div></div>
          <div className="stat-card"><div className="stat-label">Needs Revision</div><div className="stat-value" style={{ color: 'var(--red)' }}>{needsRevision.length}</div></div>
          <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value" style={{ color: 'var(--green)' }}>{approved.length}</div></div>
        </div>

        {needsRevision.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="section-title" style={{ marginBottom: '8px', color: 'var(--red)' }}>⚠ Needs Revision</div>
            <div className="card">
              {needsRevision.map(task => (
                <div key={task.id} className="table-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{task.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      {task.clientName} · <span className="tag">{task.deliverableType}</span>
                      <span style={{ marginLeft: '8px', color: deadlineColor(task.deadline) }}>Due {new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  {statusBadge(submissions[task.id] || 'pending')}
                  <a href={`/designer/submit?taskId=${task.id}`} className="btn btn-sm btn-warning">Resubmit</a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="section-header">
          <div className="section-title">All Tasks</div>
          <a href="/designer/submit" className="btn btn-sm btn-primary">+ Submit Work</a>
        </div>

        {tasks.length === 0 ? (
          <div className="empty">No tasks assigned yet. Check back soon.</div>
        ) : (
          <div className="card">
            {tasks.map(task => {
              const status = submissions[task.id]
              return (
                <div key={task.id} className="table-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{task.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      {task.clientName} · <span className="tag">{task.deliverableType}</span>
                      <span style={{ marginLeft: '8px', color: deadlineColor(task.deadline) }}>
                        Due {new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {task.brief && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{task.brief}</div>}
                  </div>
                  {status ? statusBadge(status) : <span className="badge badge-neutral">Not submitted</span>}
                  {(!status || status === 'revision' || status === 'rejected') && (
                    <a href={`/designer/submit?taskId=${task.id}`} className="btn btn-sm btn-primary">
                      {status === 'revision' || status === 'rejected' ? 'Resubmit' : 'Submit'}
                    </a>
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
