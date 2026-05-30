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

export default function PMClientsPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    fetch('/api/clients').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setClients(data)
    })
  }, [router])

  async function addClient() {
    if (!newName.trim()) return
    setSaving(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const c = await res.json()
    setClients(prev => [...prev, c])
    setNewName(''); setShowAdd(false); setSaving(false)
  }

  async function updateClient(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    const client = clients.find(c => c.id === id)!
    const res = await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...client, name: editName.trim() }),
    })
    const updated = await res.json()
    setClients(prev => prev.map(c => c.id === id ? updated : c))
    setEditId(null); setSaving(false)
  }

  async function deleteClient(id: string) {
    if (!confirm('Delete this client? This will not delete existing submissions.')) return
    await fetch('/api/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setClients(prev => prev.filter(c => c.id !== id))
  }

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/clients" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Clients</div>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>+ Add Client</button>
        </div>

        {showAdd && (
          <div className="card-sm" style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="field col" style={{ margin: 0 }}>
              <label className="field-label">New client name</label>
              <input className="field-input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Courtesy Honda" onKeyDown={e => e.key === 'Enter' && addClient()} autoFocus />
            </div>
            <button className="btn btn-primary btn-sm" onClick={addClient} disabled={saving || !newName.trim()}>Add</button>
            <button className="btn btn-sm" onClick={() => { setShowAdd(false); setNewName('') }}>Cancel</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
          {clients.map(c => (
            <div key={c.id} className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {editId === c.id ? (
                <>
                  <input className="field-input" style={{ flex: 1, padding: '4px 8px' }} value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateClient(c.id)} autoFocus />
                  <button className="btn btn-sm btn-primary" onClick={() => updateClient(c.id)} disabled={saving}>✓</button>
                  <button className="btn btn-sm" onClick={() => setEditId(null)}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: '13px' }}>{c.name}</span>
                  <button className="btn btn-sm" style={{ padding: '4px 7px' }} onClick={() => { setEditId(c.id); setEditName(c.name) }}>✎</button>
                  <button className="btn btn-sm btn-danger" style={{ padding: '4px 7px' }} onClick={() => deleteClient(c.id)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
