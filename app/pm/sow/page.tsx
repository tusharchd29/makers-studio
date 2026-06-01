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
  { key: 'reels' as const,         label: 'Reels' },
  { key: 'stories' as const,       label: 'Stories' },
  { key: 'statics' as const,       label: 'Statics' },
  { key: 'videos' as const,        label: 'Videos' },
  { key: 'photos' as const,        label: 'Photos' },
  { key: 'carousels' as const,     label: 'Carousels' },
  { key: 'youtubeShorts' as const, label: 'YT Shorts' },
]

const PRIO_COLORS: Record<string, { bg: string; color: string }> = {
  A: { bg: '#c8f55a22', color: '#7aaa00' },
  B: { bg: '#5b9cf622', color: '#3a7bd5' },
  C: { bg: '#ff9b4e22', color: '#cc6600' },
  D: { bg: '#ff5f5f22', color: '#cc0000' },
}

// ── Inline SOW Edit Form ───────────────────────────────────────────────────
function SOWEditForm({
  clientName, entry, onSave, onCancel, saving, isNew,
}: {
  clientName: string
  entry: Omit<SOWEntry, 'clientId'>
  onSave: (e: Omit<SOWEntry, 'clientId'>) => void
  onCancel: () => void
  saving: boolean
  isNew: boolean
}) {
  const [form, setForm] = useState(entry)
  const set = (k: keyof typeof form, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  return (
    <tr style={{ background: 'var(--accent)' + '11', borderBottom: '2px solid var(--accent)' }}>
      <td colSpan={9} style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-edit" style={{ fontSize: 12 }} />
          {isNew ? `Add SOW entry — ${clientName}` : `Editing — ${clientName}`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: 3 }}>SERVICE TYPE</div>
            <input className="field-input" style={{ width: '100%', padding: '5px 8px' }}
              value={form.serviceType}
              onChange={e => set('serviceType', e.target.value)}
              placeholder="e.g. PPC + Organic" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: 3 }}>CREATIVES / MONTH</div>
            <input type="number" min="0" className="field-input" style={{ width: '100%', padding: '5px 8px', textAlign: 'center' }}
              value={form.totalCreatives}
              onChange={e => set('totalCreatives', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: 3 }}>PRIORITY</div>
            <select className="field-input" style={{ width: '100%', padding: '5px 8px' }}
              value={form.priority} onChange={e => set('priority', e.target.value)}>
              {['A', 'B', 'C', 'D'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: 3 }}>STATUS</div>
            <select className="field-input" style={{ width: '100%', padding: '5px 8px' }}
              value={form.status} onChange={e => set('status', e.target.value)}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: 6 }}>BREAKDOWN BY TYPE</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BREAKDOWN.map(f => (
              <div key={f.key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: 2 }}>{f.label}</div>
                <input type="number" min="0" className="field-input"
                  style={{ width: '52px', textAlign: 'center', padding: '4px 6px', fontSize: '12px' }}
                  value={form[f.key]}
                  onChange={e => set(f.key, parseInt(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving ? '…' : <><i className="ti ti-check" style={{ marginRight: 4 }} />{isNew ? 'Add entry' : 'Save'}</>}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── SOW Table Row ─────────────────────────────────────────────────────────
function SOWRow({
  client, entry, progress, unlocked, editing, onEdit,
}: {
  client: Client
  entry?: SOWEntry
  progress?: ProgressEntry
  unlocked: boolean
  editing: boolean
  onEdit: () => void
}) {
  const approved = progress?.total || 0
  const target = entry?.totalCreatives || 0
  const pct = target > 0 ? Math.min(Math.round((approved / target) * 100), 100) : 0
  const pColor = pct >= 100 ? '#4ede8c' : pct >= 60 ? '#5b9cf6' : pct >= 30 ? '#ff9b4e' : '#ff5f5f'
  const prio = entry?.priority || 'B'
  const prioStyle = PRIO_COLORS[prio] || PRIO_COLORS.B
  const inactive = entry?.status === 'Inactive'

  if (editing) return null // replaced by inline form above

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', opacity: inactive ? 0.55 : 1, background: 'transparent' }}>
      {/* Client */}
      <td style={{ padding: '11px 16px', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>{client.name}</td>

      {/* Service type */}
      <td style={{ padding: '11px 12px', color: 'var(--text2)', fontSize: '12px', whiteSpace: 'nowrap' }}>
        {entry?.serviceType || <span style={{ color: 'var(--text3)' }}>—</span>}
      </td>

      {/* SOW Target */}
      <td style={{ textAlign: 'center', padding: '11px 12px' }}>
        <span style={{ fontWeight: 700, fontSize: '13px', color: target ? 'var(--text)' : 'var(--text3)' }}>
          {target || '—'}
        </span>
      </td>

      {/* Approved (live) */}
      <td style={{ textAlign: 'center', padding: '11px 12px' }}>
        <span style={{ fontWeight: 700, color: approved > 0 ? '#4ede8c' : 'var(--text3)', fontSize: '13px' }}>
          {approved}
        </span>
        {progress?.byType && Object.keys(progress.byType).length > 0 && (
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', marginTop: 3 }}>
            {Object.entries(progress.byType).map(([t, n]) => (
              <span key={t} style={{ fontSize: '9px', padding: '1px 4px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)' }}>
                {t.slice(0, 3)}: {n}
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Progress bar */}
      <td style={{ padding: '11px 16px', minWidth: '110px' }}>
        {target > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{pct}%</span>
              <span style={{ fontSize: '10px', color: pColor, fontWeight: 600 }}>
                {pct >= 100 ? '✓ Done' : `${target - approved} left`}
              </span>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pColor, transition: 'width 0.3s' }} />
            </div>
          </>
        ) : <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>}
      </td>

      {/* Priority */}
      <td style={{ textAlign: 'center', padding: '11px 12px' }}>
        <span style={{
          display: 'inline-block', width: 24, height: 24, lineHeight: '24px',
          borderRadius: 6, background: prioStyle.bg, color: prioStyle.color,
          fontWeight: 700, fontSize: '12px', textAlign: 'center',
        }}>{prio}</span>
      </td>

      {/* Status */}
      <td style={{ textAlign: 'center', padding: '11px 12px' }}>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: 20, fontWeight: 600,
          background: inactive ? 'var(--border)' : '#4ede8c22',
          color: inactive ? 'var(--text3)' : '#4ede8c',
        }}>{entry?.status || 'Active'}</span>
      </td>

      {/* Breakdown chips */}
      <td style={{ textAlign: 'center', padding: '11px 12px' }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          {entry && BREAKDOWN.filter(f => entry[f.key] > 0).map(f => (
            <span key={f.key} style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: 10,
              background: 'var(--surface2)', color: 'var(--text2)',
            }}>{f.label[0]}: {entry[f.key]}</span>
          ))}
          {(!entry || BREAKDOWN.every(f => !entry[f.key])) && (
            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>
          )}
        </div>
      </td>

      {/* Edit button (only when unlocked) */}
      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
        {unlocked && (
          <button className="btn btn-sm" style={{ padding: '3px 10px', fontSize: '11px' }} onClick={onEdit}>
            <i className="ti ti-settings" style={{ fontSize: 10, marginRight: 3 }} />Edit
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function PMSOWPage() {
  const [user, setUser]         = useState<{ name: string; role: string } | null>(null)
  const [clients, setClients]   = useState<Client[]>([])
  const [sow, setSOW]           = useState<SOWEntry[]>([])
  const [progress, setProgress] = useState<Record<string, ProgressEntry>>({})
  const [month, setMonth]       = useState('')
  const [loading, setLoading]   = useState(true)

  // SOW PIN lock (separate from session — same model as Postings)
  const [unlocked, setUnlocked]       = useState(false)
  const [pinInput, setPinInput]       = useState('')
  const [pinError, setPinError]       = useState('')

  // Editing state
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [addingClientId, setAddingClientId]   = useState<string | null>(null)
  const [saving, setSaving]                   = useState(false)

  // Filters
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    const [sowRes, clientRes] = await Promise.all([
      fetch('/api/sow').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ])
    if (sowRes?.sow)        { setSOW(sowRes.sow); setProgress(sowRes.progress || {}); setMonth(sowRes.month || '') }
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
    else { setPinError('Wrong PIN') }
  }

  async function handleSave(clientId: string, form: Omit<SOWEntry, 'clientId'>) {
    setSaving(true)
    const entry: SOWEntry = { clientId, ...form }
    await fetch('/api/sow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    setSOW(prev => {
      const idx = prev.findIndex(s => s.clientId === clientId)
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n }
      return [...prev, entry]
    })
    setEditingClientId(null)
    setAddingClientId(null)
    setSaving(false)
  }

  if (!user) return null

  // Sort: priority A→D, then name
  const sorted = [...clients].sort((a, b) => {
    const ea = sow.find(s => s.clientId === a.id)
    const eb = sow.find(s => s.clientId === b.id)
    const pa = ea?.priority || 'Z'
    const pb = eb?.priority || 'Z'
    return pa !== pb ? pa.localeCompare(pb) : a.name.localeCompare(b.name)
  })

  const filtered = sorted.filter(c => {
    const e = sow.find(s => s.clientId === c.id)
    if (filterStatus   && (e?.status   || 'Active')  !== filterStatus)   return false
    if (filterPriority && (e?.priority || 'B')        !== filterPriority) return false
    return true
  })

  // Totals
  const activeEntries  = sow.filter(s => s.status === 'Active')
  const totalRequired  = activeEntries.reduce((a, b) => a + (b.totalCreatives || 0), 0)
  const totalApproved  = Object.values(progress).reduce((a, b) => a + b.total, 0)
  const overallPct     = totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0
  const overallColor   = overallPct >= 80 ? '#4ede8c' : overallPct >= 50 ? '#ff9b4e' : '#ff5f5f'

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
          {/* Lock/Unlock controls */}
          {!unlocked
            ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
                  placeholder="SOW PIN" onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                  style={{ padding: '5px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 7, width: 110, background: 'var(--surface)', color: 'var(--text)' }} />
                <button className="btn btn-sm btn-primary" onClick={tryUnlock}>
                  <i className="ti ti-lock-open" style={{ marginRight: 4 }} />Unlock
                </button>
                {pinError && <span style={{ fontSize: 11, color: '#dc2626' }}>{pinError}</span>}
              </div>
            : <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => { setUnlocked(false); setEditingClientId(null); setAddingClientId(null) }}>
                  <i className="ti ti-lock" style={{ marginRight: 4 }} />Lock
                </button>
              </div>}
        </div>

        {/* Stats summary */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Active clients',    val: activeEntries.length,  color: 'var(--accent)' },
            { label: 'Creatives required', val: totalRequired,         color: 'var(--text)' },
            { label: `Approved (${month.split(' ')[0] || 'this month'})`, val: totalApproved, color: totalApproved >= totalRequired ? '#4ede8c' : '#ff9b4e' },
            { label: 'Completion',        val: `${overallPct}%`,       color: overallColor },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '10px 16px', textAlign: 'center', flex: '1 0 80px', minWidth: 80 }}>
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
            {['A', 'B', 'C', 'D'].map(p => <option key={p} value={p}>Priority {p}</option>)}
          </select>
          {(filterStatus || filterPriority) && (
            <button className="btn btn-sm" onClick={() => { setFilterStatus(''); setFilterPriority('') }}>Clear filters</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>
            {filtered.length} of {clients.length} clients · {month}
          </span>
        </div>

        {/* Table */}
        {loading
          ? <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
              <span className="spinner" style={{ marginRight: 8 }} />Loading SOW…
            </div>
          : filtered.length === 0
            ? <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
                <i className="ti ti-file-off" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
                No records match this filter.
              </div>
            : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                        {['Client', 'Service Type', 'SOW Target', 'Approved', 'Progress', 'Priority', 'Status', 'Breakdown', ''].map(h => (
                          <th key={h} style={{
                            textAlign: h === 'Client' || h === 'Service Type' ? 'left' : 'center',
                            padding: '10px 12px', color: 'var(--text3)', fontSize: '11px',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                            paddingLeft: h === 'Client' ? 16 : 12,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(client => {
                        const entry   = sow.find(s => s.clientId === client.id)
                        const prog    = progress[client.name]
                        const isEdit  = editingClientId === client.id
                        const isAdd   = addingClientId  === client.id

                        return [
                          // Edit form row (replaces normal row)
                          (isEdit || isAdd) && (
                            <SOWEditForm key={`form-${client.id}`}
                              clientName={client.name}
                              entry={entry ? { ...EMPTY_ENTRY, ...entry } : EMPTY_ENTRY}
                              onSave={form => handleSave(client.id, form)}
                              onCancel={() => { setEditingClientId(null); setAddingClientId(null) }}
                              saving={saving}
                              isNew={isAdd} />
                          ),
                          // Normal row (hidden while editing)
                          !isEdit && !isAdd && (
                            <SOWRow key={client.id}
                              client={client}
                              entry={entry}
                              progress={prog}
                              unlocked={unlocked}
                              editing={false}
                              onEdit={() => entry ? setEditingClientId(client.id) : setAddingClientId(client.id)} />
                          ),
                        ]
                      })}
                    </tbody>
                    {/* Totals footer */}
                    <tfoot>
                      <tr style={{ background: '#fff9c4', borderTop: '2px solid #d97706' }}>
                        <td style={{ padding: '9px 16px', fontWeight: 700, fontSize: '13px' }}>TOTALS</td>
                        <td />
                        <td style={{ textAlign: 'center', padding: '9px 12px', fontWeight: 700, fontSize: '13px' }}>
                          {filtered.filter(c => sow.find(s => s.clientId === c.id)?.status === 'Active').reduce((a, c) => a + (sow.find(s => s.clientId === c.id)?.totalCreatives || 0), 0)}
                        </td>
                        <td style={{ textAlign: 'center', padding: '9px 12px', fontWeight: 700, fontSize: '13px', color: '#4ede8c' }}>
                          {filtered.reduce((a, c) => a + (progress[c.name]?.total || 0), 0)}
                        </td>
                        <td colSpan={5} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>}

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          Approved count = creatives approved in Review Queue · SOW target set by PM · PIN: 11111
        </div>
      </div>
    </>
  )
}
