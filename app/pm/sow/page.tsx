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

interface Client { id: string; name: string }
interface SOWEntry {
  clientId: string; serviceType: string; totalCreatives: number
  priority: string; status: string
  reels: number; stories: number; statics: number
  videos: number; photos: number; carousels: number; youtubeShorts: number
}

const EMPTY: Omit<SOWEntry, 'clientId'> = {
  serviceType: '', totalCreatives: 0, priority: 'B', status: 'Active',
  reels: 0, stories: 0, statics: 0, videos: 0, photos: 0, carousels: 0, youtubeShorts: 0,
}

const PRIORITY_COLORS: Record<string, string> = {
  A: '#c8f55a', B: '#5b9cf6', C: '#ff9b4e', D: '#ff5f5f',
}

export default function PMSOWPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [sow, setSOW] = useState<SOWEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<SOWEntry, 'clientId'>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    Promise.all([
      fetch('/api/sow').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ]).then(([s, c]) => {
      if (Array.isArray(s)) setSOW(s)
      if (Array.isArray(c)) setClients(c)
    })
  }, [router])

  function startEdit(clientId: string) {
    const entry = sow.find(s => s.clientId === clientId)
    setForm(entry ? { ...EMPTY, ...entry } : EMPTY)
    setEditing(clientId)
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    const entry: SOWEntry = { clientId: editing, ...form }
    await fetch('/api/sow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    setSOW(prev => {
      const idx = prev.findIndex(s => s.clientId === editing)
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n }
      return [...prev, entry]
    })
    setEditing(null); setSaving(false)
  }

  if (!user) return null

  // Sort: by priority then name
  const sortedClients = [...clients].sort((a, b) => {
    const ea = sow.find(s => s.clientId === a.id)
    const eb = sow.find(s => s.clientId === b.id)
    const pa = ea?.priority || 'Z'
    const pb = eb?.priority || 'Z'
    return pa !== pb ? pa.localeCompare(pb) : a.name.localeCompare(b.name)
  })

  const breakdownFields = [
    { key: 'reels' as const, label: 'Reels' },
    { key: 'stories' as const, label: 'Stories' },
    { key: 'statics' as const, label: 'Statics' },
    { key: 'videos' as const, label: 'Videos' },
    { key: 'photos' as const, label: 'Photos' },
    { key: 'carousels' as const, label: 'Carousels' },
    { key: 'youtubeShorts' as const, label: 'YT Shorts' },
  ]

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/sow" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Scope of Work</div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Synced from Postings — {clients.length} clients</span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Client</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Service Type</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Creatives/Mo</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Breakdown</th>
                  <th style={{ width: '60px' }} />
                </tr>
              </thead>
              <tbody>
                {sortedClients.map(client => {
                  const entry = sow.find(s => s.clientId === client.id)
                  const isEditing = editing === client.id
                  const prioColor = PRIORITY_COLORS[entry?.priority || 'B'] || '#5b9cf6'
                  const isInactive = entry?.status === 'Inactive'

                  return (
                    <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', opacity: isInactive ? 0.5 : 1 }}>
                      {/* Client name */}
                      <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{client.name}</td>

                      {/* Service Type */}
                      <td style={{ padding: '12px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input className="field-input" style={{ width: '180px', padding: '4px 8px' }}
                            value={form.serviceType}
                            onChange={e => setForm(p => ({ ...p, serviceType: e.target.value }))} />
                        ) : (
                          <span style={{ fontSize: '12px' }}>{entry?.serviceType || '—'}</span>
                        )}
                      </td>

                      {/* Total Creatives */}
                      <td style={{ textAlign: 'center', padding: '12px 12px' }}>
                        {isEditing ? (
                          <input type="number" min="0" className="field-input"
                            style={{ width: '60px', textAlign: 'center', padding: '4px 6px' }}
                            value={form.totalCreatives}
                            onChange={e => setForm(p => ({ ...p, totalCreatives: parseInt(e.target.value) || 0 }))} />
                        ) : (
                          <span style={{ fontWeight: 700, color: entry?.totalCreatives ? 'var(--text)' : 'var(--text3)' }}>
                            {entry?.totalCreatives || '—'}
                          </span>
                        )}
                      </td>

                      {/* Priority */}
                      <td style={{ textAlign: 'center', padding: '12px 12px' }}>
                        {isEditing ? (
                          <select className="field-input" style={{ width: '60px', padding: '4px 6px' }}
                            value={form.priority}
                            onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                            {['A','B','C','D'].map(p => <option key={p}>{p}</option>)}
                          </select>
                        ) : (
                          <span style={{
                            display: 'inline-block', width: '24px', height: '24px', lineHeight: '24px',
                            borderRadius: '6px', background: prioColor + '33',
                            color: prioColor, fontWeight: 700, fontSize: '12px', textAlign: 'center',
                          }}>{entry?.priority || '—'}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center', padding: '12px 12px' }}>
                        {isEditing ? (
                          <select className="field-input" style={{ width: '90px', padding: '4px 6px' }}
                            value={form.status}
                            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                            <option>Active</option>
                            <option>Inactive</option>
                          </select>
                        ) : (
                          <span style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                            background: isInactive ? 'var(--border)' : '#4ede8c22',
                            color: isInactive ? 'var(--text3)' : '#4ede8c',
                          }}>{entry?.status || 'Active'}</span>
                        )}
                      </td>

                      {/* Breakdown — compact chips */}
                      <td style={{ textAlign: 'center', padding: '12px 12px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {breakdownFields.map(f => (
                              <div key={f.key} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '2px' }}>{f.label}</div>
                                <input type="number" min="0" className="field-input"
                                  style={{ width: '44px', textAlign: 'center', padding: '2px 4px', fontSize: '12px' }}
                                  value={form[f.key]}
                                  onChange={e => setForm(p => ({ ...p, [f.key]: parseInt(e.target.value) || 0 }))} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {breakdownFields.filter(f => entry && entry[f.key] > 0).map(f => (
                              <span key={f.key} style={{
                                fontSize: '10px', padding: '1px 6px', borderRadius: '10px',
                                background: 'var(--surface2)', color: 'var(--text2)',
                              }}>{f.label[0]}: {entry![f.key]}</span>
                            ))}
                            {(!entry || breakdownFields.every(f => !entry[f.key])) && (
                              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>—</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving ? '…' : '✓'}</button>
                            <button className="btn btn-sm" onClick={() => setEditing(null)}>✕</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" onClick={() => startEdit(client.id)}>Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
