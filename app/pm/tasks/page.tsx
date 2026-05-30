'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, DELIVERABLE_TYPES } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard', href: '/pm/dashboard' },
  { label: 'Review Queue', href: '/pm/review' },
  { label: 'Tasks', href: '/pm/tasks' },
  { label: 'SOW', href: '/pm/sow' },
  { label: 'Clients', href: '/pm/clients' },
]

interface Client { id: string; name: string }

const DESIGNERS = ['Anshu', 'Amit', 'Ranjeet']

function deadlineColor(d: string) {
  const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'var(--red)'
  if (diff <= 2) return 'var(--orange)'
  return 'var(--text2)'
}

export default function PMTasksPage() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '' })
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ]).then(([t, c]) => {
      if (Array.isArray(t)) setTasks(t.reverse())
      if (Array.isArray(c)) setClients(c)
    })
  }, [router])

  function openNew() { setEditTask(null); setForm({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '' }); setShowForm(true) }
  function openEdit(t: Task) { setEditTask(t); setForm({ clientId: t.clientId, name: t.name, deliverableType: t.deliverableType, assignedTo: t.assignedTo, deadline: t.deadline.split('T')[0], brief: t.brief || '' }); setShowForm(true) }

  async function saveTask() {
    if (!form.clientId || !form.name || !form.deadline) return
    setSaving(true)
    const client = clients.find(c => c.id === form.clientId)!
    const body = editTask
      ? { ...editTask, ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'] }
      : { ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'] }
    const res = await fetch('/api/tasks', {
      method: editTask ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const saved = await res.json()
    setTasks(prev => editTask ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev])
    setShowForm(false); setSaving(false)
  }

  async function deleteTask(id: string) {
    await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/tasks" tabs={PM_TABS} />
      <div className="page">
        <div className="section-header">
          <div className="section-title">Tasks</div>
          <button className="btn btn-sm btn-primary" onClick={openNew}>+ New Task</button>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
            <div className="modal">
              <div className="modal-title">{editTask ? 'Edit Task' : 'New Task'}</div>
              <div className="row">
                <div className="col field">
                  <label className="field-label">Client *</label>
                  <select className="field-select" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                    <option value="">Select…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col field">
                  <label className="field-label">Assign to</label>
                  <select className="field-select" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                    {DESIGNERS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Task name *</label>
                <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali Reel" />
              </div>
              <div className="row">
                <div className="col field">
                  <label className="field-label">Deliverable type</label>
                  <select className="field-select" value={form.deliverableType} onChange={e => setForm(f => ({ ...f, deliverableType: e.target.value }))}>
                    {DELIVERABLE_TYPES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="col field">
                  <label className="field-label">Deadline *</label>
                  <input className="field-input" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Brief for designer</label>
                <textarea className="field-textarea" value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} placeholder="Any specific instructions…" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveTask} disabled={saving || !form.clientId || !form.name || !form.deadline}>
                  {saving ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="empty">No tasks yet. Create your first task above.</div>
        ) : (
          <div className="card">
            {tasks.map(t => (
              <div key={t.id} className="table-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '2px' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{t.clientName}</span>
                    <span>→ {t.assignedTo}</span>
                    <span className="tag">{t.deliverableType}</span>
                    <span style={{ color: deadlineColor(t.deadline) }}>
                      Due {new Date(t.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {t.brief && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{t.brief}</div>}
                </div>
                <button className="btn btn-sm" onClick={() => openEdit(t)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteTask(t.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
