'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Creatives',    href: '/pm/creatives', icon: 'ti-photo-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
]

interface ApprovedFile {
  id: string; taskId: string; taskName: string
  clientName: string; designerName: string
  sowMonth: string; deliverableType: string
  storagePath: string; viewUrl: string
  totalDrafts: number; approvedAt: string; approvedBy: string
}

interface Submission {
  id: string; taskId: string; taskName: string
  clientName: string; designerName: string
  deliverableType: string; fileName: string
  draftNumber: number; status: string
  pmComment: string; designerNote: string
  viewUrl: string; storagePath: string; submittedAt: string
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'In Review',      color: '#ff9b4e', bg: '#ff9b4e15', icon: '⏳' },
  approved: { label: 'Approved',        color: '#4ede8c', bg: '#4ede8c15', icon: '✅' },
  revision: { label: 'Needs Revision',  color: '#5b9cf6', bg: '#5b9cf615', icon: '↩' },
  rejected: { label: 'Rejected',        color: '#ff5f5f', bg: '#ff5f5f15', icon: '✕' },
}

const DELIVERABLE_ICONS: Record<string, string> = {
  'Reel': 'ti-video', 'Story': 'ti-device-mobile', 'Static': 'ti-photo',
  'Carousel': 'ti-layout-grid', 'YouTube Short': 'ti-brand-youtube',
  'Product Video': 'ti-video-plus', 'Photo': 'ti-camera',
}

function isVideo(fileName: string) {
  return /\.(mp4|mov|avi|webm|mkv)$/i.test(fileName || '')
}

export default function PMCreativesPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [approvedFiles, setApprovedFiles] = useState<ApprovedFile[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'approved' | 'all' | 'history'>('approved')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterDesigner, setFilterDesigner] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [historyFiles, setHistoryFiles] = useState<ApprovedFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<{ url: string; name: string; isVideo: boolean } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    Promise.all([
      fetch('/api/approved').then(r => r.json()),           // deduplicated
      fetch('/api/submissions').then(r => r.json()),
      fetch('/api/approved?history=true').then(r => r.json()), // full history
    ]).then(([approved, subs, hist]) => {
      if (Array.isArray(approved)) setApprovedFiles(approved.slice().reverse())
      if (Array.isArray(subs)) setSubmissions(subs)
      if (Array.isArray(hist)) setHistoryFiles(hist.slice().reverse())
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [router])

  // Filtered history
  const filteredHistory = useMemo(() => historyFiles.filter(f => {
    if (filterMonth && f.sowMonth !== filterMonth) return false
    if (filterClient && f.clientName !== filterClient) return false
    if (filterDesigner && f.designerName !== filterDesigner) return false
    if (search) {
      const q = search.toLowerCase()
      if (!f.taskName?.toLowerCase().includes(q) && !f.clientName?.toLowerCase().includes(q)) return false
    }
    return true
  }), [historyFiles, filterMonth, filterClient, filterDesigner, search])

  // Filter options
  const months = useMemo(() => [...new Set([
    ...approvedFiles.map(f => f.sowMonth),
    ...submissions.map(s => new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  ].filter(Boolean))].sort().reverse(), [approvedFiles, submissions])

  const clients = useMemo(() => [...new Set([
    ...approvedFiles.map(f => f.clientName),
    ...submissions.map(s => s.clientName)
  ])].sort(), [approvedFiles, submissions])

  const designers = useMemo(() => [...new Set([
    ...approvedFiles.map(f => f.designerName),
    ...submissions.map(s => s.designerName)
  ])].sort(), [approvedFiles, submissions])

  const types = useMemo(() => [...new Set([
    ...approvedFiles.map(f => f.deliverableType),
    ...submissions.map(s => s.deliverableType)
  ].filter(Boolean))].sort(), [approvedFiles, submissions])

  // Filtered approved
  const filteredApproved = useMemo(() => approvedFiles.filter(f => {
    if (filterMonth && f.sowMonth !== filterMonth) return false
    if (filterClient && f.clientName !== filterClient) return false
    if (filterDesigner && f.designerName !== filterDesigner) return false
    if (filterType && f.deliverableType !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      if (!f.taskName?.toLowerCase().includes(q) && !f.clientName?.toLowerCase().includes(q)) return false
    }
    return true
  }), [approvedFiles, filterMonth, filterClient, filterDesigner, filterType, search])

  // Filtered all submissions
  const filteredSubs = useMemo(() => submissions.filter(s => {
    if (filterClient && s.clientName !== filterClient) return false
    if (filterDesigner && s.designerName !== filterDesigner) return false
    if (filterType && s.deliverableType !== filterType) return false
    if (filterMonth) {
      const m = new Date(s.submittedAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })
      if (m !== filterMonth) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!s.taskName?.toLowerCase().includes(q) && !s.clientName?.toLowerCase().includes(q)) return false
    }
    return true
  }), [submissions, filterMonth, filterClient, filterDesigner, filterType, search])

  // Stats
  const stats = useMemo(() => ({
    totalApproved: approvedFiles.length,
    thisMonth: approvedFiles.filter(f => f.sowMonth === new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })).length,
    pending: submissions.filter(s => s.status === 'pending').length,
    revision: submissions.filter(s => s.status === 'revision').length,
  }), [approvedFiles, submissions])

  function clearFilters() {
    setFilterMonth(''); setFilterClient(''); setFilterDesigner(''); setFilterType(''); setSearch('')
  }
  const hasFilters = filterMonth || filterClient || filterDesigner || filterType || search

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/creatives" tabs={PM_TABS} />
      {/* Lightbox preview */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', maxWidth: '700px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#1a1a1a' }}>
              <span style={{ fontSize: '12px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>{previewUrl.name}</span>
              <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                <a href={previewUrl.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#7DC242', textDecoration: 'none' }}>Open ↗</a>
                <a href={previewUrl.url} download={previewUrl.name} style={{ fontSize: '12px', color: '#aaa', textDecoration: 'none' }}>⬇ Download</a>
                <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0 }}>×</button>
              </div>
            </div>
            {previewUrl.isVideo
              ? <video controls autoPlay style={{ width: '100%', maxHeight: '500px', display: 'block' }} src={previewUrl.url} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={previewUrl.url} alt={previewUrl.name} style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', display: 'block' }} />
            }
          </div>
          <p style={{ color: '#666', fontSize: '12px', marginTop: '10px' }}>Click outside to close</p>
        </div>
      )}

      <div className="page">

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Total Approved', val: stats.totalApproved, color: '#4ede8c' },
            { label: 'Approved This Month', val: stats.thisMonth, color: '#7DC242' },
            { label: 'Pending Review', val: stats.pending, color: '#ff9b4e' },
            { label: 'Needs Revision', val: stats.revision, color: '#5b9cf6' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {([['approved', '✅ Approved Creatives'], ['all', '📋 All Submissions'], ['history', '🗂 Approval History']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', fontFamily: 'inherit',
              color: activeTab === tab ? '#7DC242' : 'var(--text3)',
              borderBottom: `2px solid ${activeTab === tab ? '#7DC242' : 'transparent'}`,
              marginBottom: '-1px',
            }}>{label} ({tab === 'approved' ? filteredApproved.length : filteredSubs.length})</button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '13px' }} />
            <input className="field-input" placeholder="Search task or client…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '30px', width: '100%' }} />
          </div>
          <select className="field-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ minWidth: '150px' }}>
            <option value="">All months</option>
            {months.map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="field-select" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ minWidth: '140px' }}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="field-select" value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)} style={{ minWidth: '130px' }}>
            <option value="">All designers</option>
            {designers.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="field-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: '120px' }}>
            <option value="">All types</option>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          {hasFilters && <button className="btn btn-sm" onClick={clearFilters}>Clear ✕</button>}
        </div>

        {loading ? (
          <div className="empty">Loading creatives…</div>
        ) : activeTab === 'history' ? (
          filteredHistory.length === 0 ? (
            <div className="empty">No approval history{hasFilters ? ' matches filters' : ''}.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)' }}>
                Full approval log — every approval event including re-approvals after revisions. {filteredHistory.length} entries.
              </div>
              {filteredHistory.map((f, i) => {
                const vid = isVideo(f.storagePath)
                return (
                  <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>{f.taskName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{f.clientName}</span>
                        <span style={{ color: 'var(--border)' }}>·</span>
                        <span>by <strong>{f.designerName}</strong></span>
                        {f.deliverableType && <span className="tag">{f.deliverableType}</span>}
                        {f.sowMonth && <span className="tag" style={{ background: '#4ede8c15', color: '#4ede8c', border: '0.5px solid #4ede8c40' }}>{f.sowMonth}</span>}
                        <span style={{ color: 'var(--text3)', fontSize: '11px' }}>Draft {f.totalDrafts}</span>
                        {f.approvedAt && <span style={{ color: 'var(--text3)', fontSize: '11px' }}>· {new Date(f.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                        {f.approvedBy && <span style={{ color: 'var(--text3)', fontSize: '11px' }}>· by {f.approvedBy}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {f.viewUrl && f.viewUrl !== '#' && (
                        <>
                          <button onClick={() => setPreviewUrl({ url: f.viewUrl, name: f.taskName, isVideo: vid })} className="btn btn-sm" style={{ fontSize: '11px' }}>
                            <i className={`ti ${vid ? 'ti-player-play' : 'ti-eye'}`} /> Preview
                          </button>
                          <a href={`/api/download?url=${encodeURIComponent(f.viewUrl)}&name=${encodeURIComponent(f.taskName)}`} className="btn btn-sm" style={{ fontSize: '11px' }}>⬇</a>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : activeTab === 'approved' ? (
          filteredApproved.length === 0 ? (
            <div className="empty">No approved creatives{hasFilters ? ' match these filters' : ' yet'}.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredApproved.map((f, i) => {
                const icon = DELIVERABLE_ICONS[f.deliverableType] || 'ti-file'
                const vid = isVideo(f.storagePath)
                return (
                  <div key={f.id || i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', borderLeft: '3px solid #4ede8c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <i className={`ti ${icon}`} style={{ color: '#7DC242', fontSize: '14px', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.taskName}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{f.clientName}</span>
                        <span style={{ color: 'var(--border)' }}>·</span>
                        <span>by <strong>{f.designerName}</strong></span>
                        {f.deliverableType && <span className="tag">{f.deliverableType}</span>}
                        {f.sowMonth && <span className="tag" style={{ background: '#4ede8c15', color: '#4ede8c', border: '0.5px solid #4ede8c40' }}>{f.sowMonth}</span>}
                        <span style={{ color: 'var(--text3)', fontSize: '11px' }}>
                          {f.totalDrafts} draft{Number(f.totalDrafts) !== 1 ? 's' : ''}
                        </span>
                        {f.approvedAt && (
                          <span style={{ color: 'var(--text3)', fontSize: '11px' }}>
                            · {new Date(f.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {f.viewUrl && f.viewUrl !== '#' && (
                        <>
                          <button
                            onClick={() => setPreviewUrl({ url: f.viewUrl, name: f.taskName, isVideo: vid })}
                            className="btn btn-sm"
                            style={{ fontSize: '11px' }}
                          >
                            <i className={`ti ${vid ? 'ti-player-play' : 'ti-eye'}`} /> Preview
                          </button>
                          <a href={f.viewUrl} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: '11px' }}>Open ↗</a>
                          <a href={`/api/download?url=${encodeURIComponent(f.viewUrl)}&name=${encodeURIComponent(f.taskName)}`} className="btn btn-sm" style={{ fontSize: '11px' }}>⬇</a>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          // All submissions tab
          filteredSubs.length === 0 ? (
            <div className="empty">No submissions{hasFilters ? ' match these filters' : ' yet'}.</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredSubs.map(s => {
                const meta = STATUS_META[s.status] || STATUS_META.pending
                const icon = DELIVERABLE_ICONS[s.deliverableType] || 'ti-file'
                const vid = isVideo(s.fileName)
                return (
                  <div key={s.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${meta.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <i className={`ti ${icon}`} style={{ color: meta.color, fontSize: '14px', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.taskName}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{s.clientName}</span>
                        <span style={{ color: 'var(--border)' }}>·</span>
                        <span>by <strong>{s.designerName}</strong></span>
                        {s.deliverableType && <span className="tag">{s.deliverableType}</span>}
                        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Draft {s.draftNumber}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                          {new Date(s.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {s.pmComment && s.status !== 'approved' && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: meta.color, padding: '4px 8px', background: meta.bg, borderRadius: '6px', display: 'inline-block' }}>
                          PM: {s.pmComment}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: meta.bg, color: meta.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {meta.icon} {meta.label}
                      </span>
                      {s.viewUrl && s.viewUrl !== '#' && (
                        <>
                          <button
                            onClick={() => setPreviewUrl({ url: s.viewUrl, name: s.fileName, isVideo: vid })}
                            className="btn btn-sm"
                            style={{ fontSize: '11px' }}
                          >
                            <i className={`ti ${vid ? 'ti-player-play' : 'ti-eye'}`} /> Preview
                          </button>
                          <a href={`/api/download?url=${encodeURIComponent(s.viewUrl)}&name=${encodeURIComponent(s.fileName)}`} className="btn btn-sm" style={{ fontSize: '11px' }}>⬇</a>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </>
  )
}
