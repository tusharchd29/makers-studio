'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { SOWEntry } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard', href: '/pm/dashboard' },
  { label: 'Review Queue', href: '/pm/review' },
  { label: 'Tasks', href: '/pm/tasks' },
  { label: 'SOW', href: '/pm/sow' },
  { label: 'Clients', href: '/pm/clients' },
]

interface Client { id: string; name: string }

const EMPTY_SOW = { reels: 0, stories: 0, statics: 0, videos: 0, photos: 0, carousels: 0, youtubeShorts: 0 }

export default function PMSOWPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [sow, setSOW] = useState<SOWEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_SOW)
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
    setForm(entry ? { reels: entry.reels, stories: entry.stories, statics: entry.statics, videos: entry.videos, photos: entry.photos, carousels: entry.carousels, youtubeShorts: entry.youtubeShorts } : EMPTY_SOW)
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

  const fields: { key: keyof typeof EMPTY_SOW; label: string }[] = [
    { key: 'reels', label: 'Reels' }, { key: 'stories', label: 'Stories' },
    { key: 'statics', label: 'Statics' }, { key: 'videos', label: 'Videos' },
    { key: 'photos', label: 'Photos' }, { key: 'carousels', label: 'Carousels' },
    { key: 'youtubeShorts', label: 'YT Shorts' },
  ]

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/sow" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Scope of Work</div>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Set once per client — stays until agreement changes</span>
        </div>

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text3)', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', paddingRight: '12px' }}>Client</th>
                  {fields.map(f => (
                    <th key={f.key} style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--text3)', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</th>
                  ))}
                  <th style={{ width: '60px' }} />
                </tr>
              </thead>
              <tbody>
                {clients.map(client => {
                  const entry = sow.find(s => s.clientId === client.id)
                  const isEditing = editing === client.id
                  return (
                    <tr key={client.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px 10px 0', fontWeight: 500, whiteSpace: 'nowrap' }}>{client.name}</td>
                      {fields.map(f => (
                        <td key={f.key} style={{ textAlign: 'center', padding: '10px 8px' }}>
                          {isEditing ? (
                            <input
                              type="number" min="0"
                              className="field-input"
                              style={{ width: '60px', textAlign: 'center', padding: '4px 6px' }}
                              value={form[f.key]}
                              onChange={e => setForm(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                            />
                          ) : (
                            <span style={{ color: entry && entry[f.key] > 0 ? 'var(--text)' : 'var(--text3)' }}>
                              {entry ? entry[f.key] || '—' : '—'}
                            </span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
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
