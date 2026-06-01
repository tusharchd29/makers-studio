'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
  { label: 'Clients',      href: '/pm/clients',   icon: 'ti-building' },
]

const SOW_PIN = '11111'

interface Client { id: string; name: string }
interface SOWEntry {
  clientId: string; serviceType: string; totalCreatives: number
  priority: string; status: string
  reels: number; stories: number; statics: number
  videos: number; photos: number; carousels: number; youtubeShorts: number
}
interface ProgressEntry { total: number; byType: Record<string, number> }

const EMPTY_ENTRY: Omit<SOWEntry, 'clientId'> = {
  serviceType: '', totalCreatives: 0, priority: 'B', status: 'Active',
  reels: 0, stories: 0, statics: 0, videos: 0, photos: 0, carousels: 0, youtubeShorts: 0,
}

const BREAKDOWN = [
  { key: 'reels'         as const, label: 'Reels' },
  { key: 'stories'       as const, label: 'Stories' },
  { key: 'statics'       as const, label: 'Statics' },
  { key: 'videos'        as const, label: 'Videos' },
  { key: 'photos'        as const, label: 'Photos' },
  { key: 'carousels'     as const, label: 'Carousels' },
  { key: 'youtubeShorts' as const, label: 'YT Shorts' },
]

const PRIO_COLORS: Record<string, { bg: string; color: string }> = {
  A: { bg: '#c8f55a22', color: '#7aaa00' },
  B: { bg: '#5b9cf622', color: '#3a7bd5' },
  C: { bg: '#ff9b4e22', color: '#cc6600' },
  D: { bg: '#ff5f5f22', color: '#cc0000' },
}

export default function PMSOWPage() {
  const [user, setUser]         = useState<{ name: string; role: string } | null>(null)
  const [clients, setClients]   = useState<Client[]>([])
  const [sow, setSOW]           = useState<SOWEntry[]>([])
  const [progress, setProgress] = useState<Record<string, ProgressEntry>>({})
  const [month, setMonth]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Omit<SOWEntry, 'clientId'>>(EMPTY_ENTRY)
  const [saving, setSaving]     = useState(false)
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    const [sowRes, clientRes] = await Promise.all([
      fetch('/api/sow').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ])
    if (sowRes?.sow) { setSOW(sowRes.sow); setProgress(sowRes.progress || {}); setMonth(sowRes.month || '') }
    else if (Array.isArray(sowRes)) setSOW(sowRes)
    if (Array.isArray(clientRes)) setClients(clientRes)
    setLoading(false)
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    load()
  }, [router, load])

  function tryUnlock() {
    if (pinInput === SOW_PIN) { setUnlocked(true); setPinError(''); setPinInput('') }
    else { setPinError('Wrong PIN — try 11111') }
  }

  function startEdit(clientId: string) {
    const existing = sow.find(s => s.clientId === clientId)
    setEditForm(existing ? { ...EMPTY_ENTRY, ...existing } : { ...EMPTY_ENTRY })
    setEditingId(clientId)
  }

  async function handleSave() {
    if (!editingId) return
    setSaving(true)
    const entry: SOWEntry = { clientId: editingId, ...editForm }
    await fetch('/api/sow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    setSOW(prev => {
      const idx = prev.findIndex(s => s.clientId === editingId)
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n }
      return [...prev, entry]
    })
    setEditingId(null)
    setSaving(false)
  }

  if (!user) return null

  const sorted = [...clients].sort((a, b) => {
    const pa = sow.find(s => s.clientId === a.id)?.priority || 'Z'
    const pb = sow.find(s => s.clientId === b.id)?.priority || 'Z'
    return pa !== pb ? pa.localeCompare(pb) : a.name.localeCompare(b.name)
  })

  const filtered = sorted.filter(c => {
    const e = sow.find(s => s.clientId === c.id)
    if (filterStatus   && (e?.status   || 'Active') !== filterStatus)   return false
    if (filterPriority && (e?.priority || 'B')      !== filterPriority) return false
    return true
  })

  const activeEntries = sow.filter(s => s.status === 'Active')
  const totalRequired = activeEntries.reduce((a, b) => a + (b.totalCreatives || 0), 0)
  const totalApproved = Object.values(progress).reduce((a, b) => a + b.total, 0)
  const overallPct    = totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0
  const overallColor  = overallPct >= 80 ? '#4ede8c' : overallPct >= 50 ? '#ff9b4e' : '#ff5f5f'

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/sow" tabs={PM_TABS} />
      <div className="page">

        {/* Header */}
        <div className="section-header" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="section-title">Scope of Work</div>
            {unlocked
              ? <span style={{ fontSize: 11, background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-lock-open" style={{ fontSize: 11 }} /> Edit mode
                </span>
              : <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '2px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-lock" style={{ fontSize: 11 }} /> Read only
                </span>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!unlocked ? <>
              <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
                placeholder="Enter PIN to edit" onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                style={{ padding: '5px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 7, width: 140, background: 'var(--surface)', color: 'var(--text)' }} />
              <button className="btn btn-sm btn-primary" onClick={tryUnlock}>
                <i className="ti ti-lock-open" style={{ marginRight: 4 }} />Unlock
              </button>
              {pinError && <span style={{ fontSize: 11, color: '#dc2626' }}>{pinError}</span>}
            </> : <>
              <button className="btn btn-sm" onClick={() => { setUnlocked(false); setEditingId(null) }}>
                <i className="ti ti-lock" style={{ marginRight: 4 }} />Lock
              </button>
            </>}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Active clients',    val: activeEntries.length,  color: 'var(--accent)' },
            { label: 'Creatives required', val: totalRequired,         color: 'var(--text)' },
            { label: `Approved (${month.split(' ')[0] || 'this month'})`, val: totalApproved, color: totalApproved >= totalRequired ? '#4ede8c' : '#ff9b4e' },
            { label: 'Completion',        val: `${overallPct}%`,       color: overallColor },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '10px 16px', textAlign: 'center', flex: '1 0 80px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="field-input" style={{ padding: '6px 10px', fontSize: 12, minWidth: 130 }}
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <select className="field-input" style={{ padding: '6px 10px', fontSize: 12, minWidth: 140 }}
            value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All priorities</option>
            {['A','B','C','D'].map(p => <option key={p} value={p}>Priority {p}</option>)}
          </select>
          {(filterStatus || filterPriority) && (
            <button className="btn btn-sm" onClick={() => { setFilterStatus(''); setFilterPriority('') }}>Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>
            {filtered.length} clients · {month}
          </span>
        </div>

        {/* Inline edit form — shown above the table when editing */}
        {editingId && (
          <div className="card" style={{ marginBottom: 12, padding: 16, border: '2px solid var(--accent)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginBottom: 12 }}>
              Editing: {clients.find(c => c.id === editingId)?.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>SERVICE TYPE</div>
                <input className="field-input" style={{ width: '100%', padding: '6px 8px' }}
                  value={editForm.serviceType}
                  onChange={e => setEditForm(p => ({ ...p, serviceType: e.target.value }))}
                  placeholder="e.g. PPC + Organic" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>CREATIVES / MONTH</div>
                <input type="number" min="0" className="field-input" style={{ width: '100%', padding: '6px 8px', textAlign: 'center' }}
                  value={editForm.totalCreatives}
                  onChange={e => setEditForm(p => ({ ...p, totalCreatives: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>PRIORITY</div>
                <select className="field-input" style={{ width: '100%', padding: '6px 8px' }}
                  value={editForm.priority} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))}>
                  {['A','B','C','D'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>STATUS</div>
                <select className="field-input" style={{ width: '100%', padding: '6px 8px' }}
                  value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>BREAKDOWN BY TYPE</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BREAKDOWN.map(f => (
                  <div key={f.key} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{f.label}</div>
                    <input type="number" min="0" className="field-input"
                      style={{ width: 56, textAlign: 'center', padding: '4px 6px', fontSize: 12 }}
                      value={editForm[f.key]}
                      onChange={e => setEditForm(p => ({ ...p, [f.key]: parseInt(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : <><i className="ti ti-check" style={{ marginRight: 4 }} />Save</>}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading
          ? <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
              <span className="spinner" style={{ marginRight: 8 }} />Loading SOW…
            </div>
          : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      {['Client','Service Type','Target','Approved','Progress','Priority','Status','Breakdown',''].map(h => (
                        <th key={h} style={{
                          textAlign: h==='Client'||h==='Service Type' ? 'left' : 'center',
                          padding: '10px 12px', paddingLeft: h==='Client' ? 16 : 12,
                          color: 'var(--text3)', fontSize: 11, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(client => {
                      const entry = sow.find(s => s.clientId === client.id)
                      const prog  = progress[client.name]
                      const approved = prog?.total || 0
                      const target   = entry?.totalCreatives || 0
                      const pct      = target > 0 ? Math.min(Math.round((approved/target)*100), 100) : 0
                      const pColor   = pct>=100?'#4ede8c':pct>=60?'#5b9cf6':pct>=30?'#ff9b4e':'#ff5f5f'
                      const prio     = entry?.priority || 'B'
                      const prioStyle = PRIO_COLORS[prio] || PRIO_COLORS.B
                      const inactive = entry?.status === 'Inactive'

                      return (
                        <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', opacity: inactive ? 0.55 : 1, background: editingId===client.id ? 'var(--accent)11' : 'transparent' }}>
                          <td style={{ padding: '11px 16px', fontWeight: 600 }}>{client.name}</td>
                          <td style={{ padding: '11px 12px', color: 'var(--text2)', fontSize: 12 }}>
                            {entry?.serviceType || <span style={{ color: 'var(--text3)' }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center', padding: '11px 12px' }}>
                            <span style={{ fontWeight: 700, color: target ? 'var(--text)' : 'var(--text3)' }}>{target || '—'}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '11px 12px' }}>
                            <span style={{ fontWeight: 700, color: approved>0?'#4ede8c':'var(--text3)' }}>{approved}</span>
                            {prog?.byType && Object.keys(prog.byType).length>0 && (
                              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', marginTop: 3 }}>
                                {Object.entries(prog.byType).map(([t,n]) => (
                                  <span key={t} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)' }}>{t.slice(0,3)}: {n}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '11px 16px', minWidth: 110 }}>
                            {target>0 ? <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{pct}%</span>
                                <span style={{ fontSize: 10, color: pColor, fontWeight: 600 }}>{pct>=100?'✓ Done':`${target-approved} left`}</span>
                              </div>
                              <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pColor }} />
                              </div>
                            </> : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center', padding: '11px 12px' }}>
                            <span style={{ display: 'inline-block', width: 24, height: 24, lineHeight: '24px', borderRadius: 6, background: prioStyle.bg, color: prioStyle.color, fontWeight: 700, fontSize: 12, textAlign: 'center' }}>{prio}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '11px 12px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: inactive?'var(--border)':'#4ede8c22', color: inactive?'var(--text3)':'#4ede8c' }}>{entry?.status||'Active'}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '11px 12px' }}>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                              {entry && BREAKDOWN.filter(f=>entry[f.key]>0).map(f=>(
                                <span key={f.key} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text2)' }}>{f.label[0]}: {entry[f.key]}</span>
                              ))}
                              {(!entry||BREAKDOWN.every(f=>!entry[f.key]))&&<span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            {unlocked && (
                              <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => startEdit(client.id)}>
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fff9c4', borderTop: '2px solid #d97706' }}>
                      <td style={{ padding: '9px 16px', fontWeight: 700, fontSize: 13 }}>TOTALS</td>
                      <td />
                      <td style={{ textAlign: 'center', padding: '9px 12px', fontWeight: 700, fontSize: 13 }}>
                        {filtered.filter(c=>sow.find(s=>s.clientId===c.id)?.status==='Active').reduce((a,c)=>a+(sow.find(s=>s.clientId===c.id)?.totalCreatives||0),0)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 12px', fontWeight: 700, fontSize: 13, color: '#4ede8c' }}>
                        {filtered.reduce((a,c)=>a+(progress[c.name]?.total||0),0)}
                      </td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>}

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          PIN to unlock editing: 11111
        </div>
      </div>
    </>
  )
}
