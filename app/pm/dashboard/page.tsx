'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { SOWEntry } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Creatives',    href: '/pm/creatives', icon: 'ti-photo-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
]

interface Submission { id: string; taskId: string; status: string; clientName: string; submittedAt: string; deliverableType: string; designerName: string }
interface Task { id: string; name: string; clientName: string; assignedTo: string; deadline: string; deliverableType: string; sowMonth: string }
interface Client { id: string; name: string }
interface ApprovedFile { clientName: string; sowMonth: string; deliverableType: string; taskName: string; viewUrl: string; designerName: string; approvedAt: string; totalDrafts: number }

const BAR_COLORS = ['#7DC242','#5b9cf6','#ff9b4e','#4ede8c','#ff5f5f','#a78bfa','#facc15','#34d399','#f472b6','#60a5fa']

export default function PMDashboard() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sow, setSOW] = useState<SOWEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [approvedFiles, setApprovedFiles] = useState<ApprovedFile[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    Promise.all([
      fetch('/api/submissions').then(r => r.json()),
      fetch('/api/sow').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/approved').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
    ]).then(([subs, sowData, clientsData, approvedData, tasksData]) => {
      if (Array.isArray(subs)) setSubmissions(subs)
      if (sowData?.sow) setSOW(sowData.sow)
      else if (Array.isArray(sowData)) setSOW(sowData)
      if (Array.isArray(clientsData)) setClients(clientsData)
      if (Array.isArray(approvedData)) setApprovedFiles(approvedData)
      if (Array.isArray(tasksData)) setTasks(tasksData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [router])

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const activeMonth  = selectedMonth

  // Month dropdown options — deduplicated
  const months = useMemo(() => {
    const all = [
      ...submissions.map(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })),
      ...approvedFiles.map(f => f.sowMonth).filter(Boolean),
      currentMonth,
    ]
    return [...new Set(all)].sort().reverse()
  }, [submissions, approvedFiles, currentMonth])

  // Submission stats for active month
  const monthSubs = useMemo(() =>
    submissions.filter(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' }) === activeMonth),
    [submissions, activeMonth])

  const approvedThisMonth = useMemo(() =>
    approvedFiles.filter(f => f.sowMonth === activeMonth),
    [approvedFiles, activeMonth])

  const approvedCount = new Set(approvedThisMonth.map(f => f.taskName + '|' + f.clientName)).size
  const pendingCount  = submissions.filter(s => s.status === 'pending').length // all-time pending
  const revisionCount = monthSubs.filter(s => s.status === 'revision').length
  const rejectedCount = monthSubs.filter(s => s.status === 'rejected').length

  // Task stats
  const submittedTaskIds = new Set(submissions.map(s => s.taskId))
  const approvedTaskIds  = new Set(submissions.filter(s => s.status === 'approved').map(s => s.taskId))
  const pendingTaskIds   = new Set(submissions.filter(s => s.status === 'pending').map(s => s.taskId))
  const overdueTaskCount = tasks.filter(t => new Date(t.deadline) < new Date() && !approvedTaskIds.has(t.id)).length
  const notSubmittedCount = tasks.filter(t => !submittedTaskIds.has(t.id)).length

  // SOW progress
  function getSOWProgress(entry: SOWEntry) {
    const client = clients.find(c => c.id === entry.clientId)
    if (!client) return { done: 0, total: 0, pct: 0 }
    const done = approvedThisMonth.filter(f => f.clientName === client.name).length
    const total = entry.totalCreatives || (entry.reels + entry.stories + entry.statics + entry.videos + entry.photos + entry.carousels + entry.youtubeShorts)
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }

  if (!user) return null
  if (loading) return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/dashboard" tabs={PM_TABS} />
      <div className="page"><div className="empty" style={{ paddingTop: '60px' }}>Loading dashboard…</div></div>
    </>
  )

  const PRIORITY_ORDER = ['A', 'B', 'C', 'D']
  const sowWithProgress = sow
    .map((entry, i) => ({ entry, ...getSOWProgress(entry), color: BAR_COLORS[i % BAR_COLORS.length] }))
    .filter(e => !!clients.find(c => c.id === e.entry.clientId) && e.entry.status !== 'Inactive')
    .sort((a, b) => {
      const pa = PRIORITY_ORDER.indexOf(a.entry.priority || 'D')
      const pb = PRIORITY_ORDER.indexOf(b.entry.priority || 'D')
      if (pa !== pb) return pa - pb
      return a.pct - b.pct
    })

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/dashboard" tabs={PM_TABS} />
      <div className="page">

        {/* Alerts row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {pendingCount > 0 && (
            <div style={{ background: '#ff9b4e12', border: '1px solid #ff9b4e40', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <i className="ti ti-clock" style={{ color: '#ff9b4e', fontSize: '16px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ff9b4e' }}>{pendingCount} submission{pendingCount > 1 ? 's' : ''} waiting for review</span>
              </div>
              <a href="/pm/review" className="btn btn-sm btn-warning">Review Now →</a>
            </div>
          )}
          {overdueTaskCount > 0 && (
            <div style={{ background: '#ff5f5f12', border: '1px solid #ff5f5f40', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <i className="ti ti-clock-exclamation" style={{ color: '#ff5f5f', fontSize: '16px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ff5f5f' }}>{overdueTaskCount} task{overdueTaskCount > 1 ? 's' : ''} overdue</span>
              </div>
              <a href="/pm/tasks" className="btn btn-sm btn-danger">View Tasks →</a>
            </div>
          )}
        </div>

        {/* ── TASKS OVERVIEW (always visible, not month-filtered) ── */}
        <div className="section-header" style={{ marginBottom: '10px' }}>
          <div className="section-title">Tasks Overview</div>
          <a href="/pm/tasks" className="btn btn-sm btn-primary">+ New Task</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {[
            { label: 'Total Tasks',    val: tasks.length,          color: 'var(--text)',  href: '/pm/tasks' },
            { label: 'Not Submitted',  val: notSubmittedCount,     color: 'var(--text2)', href: '/pm/tasks' },
            { label: 'In Review',      val: pendingCount,          color: '#ff9b4e',      href: '/pm/review' },
            { label: 'Approved',       val: approvedTaskIds.size,  color: '#4ede8c',      href: '/pm/creatives' },
            { label: 'Overdue',        val: overdueTaskCount,      color: overdueTaskCount > 0 ? '#ff5f5f' : 'var(--text3)', href: '/pm/tasks' },
          ].map(s => (
            <a key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
              <div className="stat-card" style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </a>
          ))}
        </div>

        {/* ── MONTH SELECTOR + CREATIVE STATS ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="section-title">Creatives — {activeMonth}</div>
          <select className="field-select" value={activeMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ minWidth: '180px' }}>
            {months.map(m => (
              <option key={m} value={m}>{m}{m === currentMonth ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Approved',      val: approvedCount,  color: '#4ede8c' },
            { label: 'Pending Review',val: monthSubs.filter(s => s.status === 'pending').length, color: '#ff9b4e' },
            { label: 'Revision',      val: revisionCount,  color: '#5b9cf6' },
            { label: 'Rejected',      val: rejectedCount,  color: '#ff5f5f' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent approvals for current month */}
        {approvedThisMonth.length > 0 && (
          <>
            <div className="section-header" style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                Recently Approved <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text3)' }}>({approvedThisMonth.length})</span>
              </div>
              <a href="/pm/creatives" className="btn btn-sm" style={{ fontSize: '11px' }}>View all →</a>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
              {[...approvedThisMonth].reverse().slice(0, 5).map((f, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{f.taskName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{f.clientName}</span>
                      {f.designerName && <span style={{ color: 'var(--text3)' }}>by {f.designerName}</span>}
                      {f.deliverableType && <span className="tag">{f.deliverableType}</span>}
                      {f.approvedAt && <span style={{ color: 'var(--text3)', fontSize: '11px' }}>
                        {new Date(f.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>}
                    </div>
                  </div>
                  {f.viewUrl && f.viewUrl !== '#' && (
                    <a href={f.viewUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}>View ↗</a>
                  )}
                </div>
              ))}
              {approvedThisMonth.length > 5 && (
                <div style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <a href="/pm/creatives" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>+{approvedThisMonth.length - 5} more → View all in Creatives</a>
                </div>
              )}
            </div>
          </>
        )}

        {/* SOW Progress */}
        <div className="section-header" style={{ marginBottom: '10px' }}>
          <div className="section-title">SOW Progress — {activeMonth}</div>
          <a href="/pm/sow" className="btn btn-sm">Manage SOW</a>
        </div>
        {sowWithProgress.length === 0 ? (
          <div className="empty" style={{ padding: '24px' }}>No SOW data. <a href="/pm/sow" style={{ color: 'var(--accent)' }}>Set up SOW →</a></div>
        ) : (
          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sowWithProgress.map(({ entry, done, total, pct, color }) => {
              const client = clients.find(c => c.id === entry.clientId)
              if (!client) return null
              return (
                <div key={entry.clientId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{client.name}</span>
                      {entry.serviceType && <span style={{ fontSize: '10px', color: 'var(--text3)', padding: '1px 6px', background: 'var(--surface2)', borderRadius: '10px' }}>{entry.serviceType}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{done}/{total > 0 ? total : '?'} creatives</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: pct >= 100 ? '#4ede8c' : pct >= 50 ? color : 'var(--text2)', minWidth: '36px', textAlign: 'right' }}>
                        {total > 0 ? `${pct}%` : '—'}
                      </span>
                    </div>
                  </div>
                  {total > 0 && (
                    <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct >= 100 ? '#4ede8c' : color, borderRadius: '3px', transition: 'width .3s' }} />
                    </div>
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
