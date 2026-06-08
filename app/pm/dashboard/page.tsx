'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { SOWEntry } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
]

interface Submission { status: string; clientName: string; submittedAt: string; deliverableType: string }
interface Client { id: string; name: string }

const BAR_COLORS = ['#c8f55a','#5b9cf6','#ff9b4e','#4ede8c','#ff5f5f','#a78bfa','#facc15','#34d399','#f472b6','#60a5fa']

export default function PMDashboard() {
  const [user, setUser]               = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [sow, setSOW]                 = useState<SOWEntry[]>([])
  const [clients, setClients]         = useState<Client[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  const [approvedFiles, setApprovedFiles] = useState<{clientName: string; sowMonth: string; deliverableType: string; taskName: string; viewUrl: string; designerName: string; approvedAt: string}[]>([])
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
    ]).then(([subs, sowData, clientsData, approvedData]) => {
      if (Array.isArray(subs)) setSubmissions(subs)
      if (Array.isArray(sowData)) setSOW(sowData)
      if (Array.isArray(clientsData)) setClients(clientsData)
      if (Array.isArray(approvedData)) setApprovedFiles(approvedData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [router])

  const months = useMemo(() => {
    const fromSubs = [...new Set(submissions.map(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })))]
    const fromApproved = [...new Set(approvedFiles.map(f => f.sowMonth).filter(Boolean))]
    const all = [...new Set([...fromSubs, ...fromApproved])].sort().reverse()
    return all
  }, [submissions, approvedFiles])

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const activeMonth  = selectedMonth

  const monthSubs = useMemo(() =>
    submissions.filter(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' }) === activeMonth),
    [submissions, activeMonth])

  const pending  = monthSubs.filter(s => s.status === 'pending').length
  const approvedFromFiles = approvedFiles.filter(f => f.sowMonth === activeMonth).length
  const approved = approvedFromFiles > 0 ? approvedFromFiles : monthSubs.filter(s => s.status === 'approved').length
  const rejected = monthSubs.filter(s => s.status === 'rejected').length
  const revision = monthSubs.filter(s => s.status === 'revision').length

  const totalPending = submissions.filter(s => s.status === 'pending').length

  function getSOWProgress(entry: SOWEntry) {
    const client = clients.find(c => c.id === entry.clientId)
    if (!client) return { done: 0, total: 0, pct: 0 }
    // Use approved_files filtered by sowMonth — accurate regardless of when submitted
    const done = approvedFiles.filter(f => f.clientName === client.name && f.sowMonth === activeMonth).length
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
    .filter(e => {
      const client = clients.find(c => c.id === e.entry.clientId)
      return !!client && e.entry.status !== 'Inactive'
    })
    .sort((a, b) => {
      // Sort by priority first (A→D), then by progress ascending (least done first)
      const pa = PRIORITY_ORDER.indexOf(a.entry.priority || 'D')
      const pb = PRIORITY_ORDER.indexOf(b.entry.priority || 'D')
      if (pa !== pb) return pa - pb
      return a.pct - b.pct
    })

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/dashboard" tabs={PM_TABS} />
      <div className="page">

        {/* Month selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>{activeMonth}</div>
          <select className="field-select" value={activeMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ minWidth: '180px' }}>
            {/* Always show current month first, then any past months from submissions */}
            {[currentMonth, ...months.filter(m => m !== currentMonth)].map(m => (
              <option key={m} value={m}>{m}{m === currentMonth ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>

        {/* Pending alert */}
        {totalPending > 0 && (
          <div style={{ background: '#ff9b4e18', border: '1px solid #ff9b4e40', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <i className="ti ti-clock" style={{ color: '#ff9b4e', fontSize: '16px' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ff9b4e' }}>{totalPending} submission{totalPending > 1 ? 's' : ''} waiting for review</span>
            </div>
            <a href="/pm/review" className="btn btn-sm btn-warning">Review Now →</a>
          </div>
        )}

        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: '20px' }}>
          <div className="stat-card"><div className="stat-label">Submitted</div><div className="stat-value">{monthSubs.length}</div></div>
          <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value" style={{ color: '#ff9b4e' }}>{pending}</div></div>
          <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value" style={{ color: '#4ede8c' }}>{approved}</div></div>
          <div className="stat-card"><div className="stat-label">Revision</div><div className="stat-value" style={{ color: '#5b9cf6' }}>{revision}</div></div>
          <div className="stat-card"><div className="stat-label">Rejected</div><div className="stat-value" style={{ color: '#ff5f5f' }}>{rejected}</div></div>
        </div>

        {/* SOW Progress */}
        <div className="section-header" style={{ marginBottom: '12px' }}>
          <div className="section-title">SOW Progress — {activeMonth}</div>
          <a href="/pm/sow" className="btn btn-sm">Manage SOW</a>
        </div>

        {/* Recent approvals for current month */}
        {approvedFiles.filter(f => f.sowMonth === activeMonth).length > 0 && (
          <>
            <div className="section-header" style={{ marginBottom: '10px', marginTop: '8px' }}>
              <div className="section-title">Approved This Month <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text3)' }}>({approvedFiles.filter(f => f.sowMonth === activeMonth).length})</span></div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
              {approvedFiles.filter(f => f.sowMonth === activeMonth).slice().reverse().map((f, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>{f.taskName || '—'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{f.clientName}</span>
                      {f.designerName && <span style={{ color: 'var(--text3)' }}>by {f.designerName}</span>}
                      {f.deliverableType && <span className="tag">{f.deliverableType}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#4ede8c20', color: '#4ede8c', fontWeight: 700 }}>✓ Approved</span>
                    {f.viewUrl && f.viewUrl !== '#' && (
                      <a href={f.viewUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>View ↗</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {sowWithProgress.length === 0 ? (
          <div className="empty">No SOW data. <a href="/pm/sow" style={{ color: 'var(--accent)' }}>Set up SOW →</a></div>
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
                      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                        {done}/{total > 0 ? total : '?'} creatives
                      </span>
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
