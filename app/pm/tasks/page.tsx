'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, DELIVERABLE_TYPES, SOW_MONTHS } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Creatives',    href: '/pm/creatives', icon: 'ti-photo-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
]

interface Client { id: string; name: string }
const DESIGNERS = ['Anshu', 'Amit', 'Ranjeet']

function deadlineColor(d: string) {
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'var(--red)'
  if (diff <= 2) return 'var(--orange)'
  return 'var(--text2)'
}

export default function PMTasksPage() {
  const [user, setUser]       = useState<{ name: string; role: string } | null>(null)
  const [tasks, setTasks]     = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [approvedTaskIds, setApprovedTaskIds] = useState<Set<string>>(new Set())
  const [subStatusMap, setSubStatusMap] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '', sowMonth: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterDesigner, setFilterDesigner] = useState('')
  const [filterDeadline, setFilterDeadline] = useState('')
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
      fetch('/api/submissions').then(r => r.json()),
    ]).then(([t, c, subs]) => {
      if (Array.isArray(t)) setTasks(t)
      if (Array.isArray(c)) setClients(c)
      if (Array.isArray(subs)) {
        const ids = new Set<string>(subs.filter((s: {status: string; taskId: string}) => s.status === 'approved').map((s: {taskId: string}) => s.taskId))
        setApprovedTaskIds(ids)
        const map: Record<string, string> = {}
        subs.forEach((s: {taskId: string; status: string}) => { map[s.taskId] = s.status })
        setSubStatusMap(map)
      }
    })
  }, [router])

  function openNew() {
    setEditTask(null)
    setForm({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '', sowMonth: '' })
    setShowForm(true)
  }
  function openEdit(t: Task) {
    setEditTask(t)
    setForm({ clientId: t.clientId, name: t.name, deliverableType: t.deliverableType, assignedTo: t.assignedTo, deadline: t.deadline.split('T')[0], brief: t.brief || '', sowMonth: t.sowMonth || '' })
    setShowForm(true)
  }

  async function saveTask() {
    if (!form.clientId || !form.name || !form.deadline) return
    setSaving(true)
    const client = clients.find(c => c.id === form.clientId)!
    const body = editTask
      ? { ...editTask, ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'], sowMonth: form.sowMonth }
      : { ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'], sowMonth: form.sowMonth }
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
    if (!confirm('Delete this task?')) return
    await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterClient   && t.clientName   !== filterClient)   return false
    if (filterDesigner && t.assignedTo   !== filterDesigner) return false
    if (filterDeadline === 'overdue'  && (new Date(t.deadline) >= new Date() || approvedTaskIds.has(t.id))) return false
    if (filterDeadline === 'thisWeek') {
      const diff = (new Date(t.deadline).getTime() - Date.now()) / 86400000
      if (diff < 0 || diff > 7) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.clientName.toLowerCase().includes(q)) return false
    }
    return true
  }), [tasks, filterClient, filterDesigner, filterDeadline, search])

  // Group by client
  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {}
    filtered.forEach(t => {
      if (!map[t.clientName]) map[t.clientName] = []
      map[t.clientName].push(t)
    })
    return map
  }, [filtered])

  const overdueCount = tasks.filter(t => new Date(t.deadline) < new Date() && !approvedTaskIds.has(t.id)).length

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/tasks" tabs={PM_TABS} />
      <div className="page">

        {overdueCount > 0 && (
          <div style={{ background: '#ff5f5f18', border: '1px solid #ff5f5f40', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <i className="ti ti-clock-exclamation" style={{ color: 'var(--red)', fontSize: '16px' }} />
            <span style={{ fontSize: '13px', color: 'var(--red)', fontWeight: 600 }}>{overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</span>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setFilterDeadline('overdue')}>View overdue</button>
          </div>
        )}

        <div className="section-header">
          <div className="section-title">Tasks <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: '13px' }}>({filtered.length} of {tasks.length})</span></div>
          <button className="btn btn-sm btn-primary" onClick={openNew}>+ New Task</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '13px' }} />
            <input className="field-input" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '30px', width: '100%' }} />
          </div>
          <select className="field-select" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ minWidth: '150px' }}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id}>{c.name}</option>)}
          </select>
          <select className="field-select" value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)} style={{ minWidth: '130px' }}>
            <option value="">All designers</option>
            {DESIGNERS.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="field-select" value={filterDeadline} onChange={e => setFilterDeadline(e.target.value)} style={{ minWidth: '130px' }}>
            <option value="">All deadlines</option>
            <option value="thisWeek">Due this week</option>
            <option value="overdue">Overdue</option>
          </select>
          {(search || filterClient || filterDesigner || filterDeadline) && (
            <button className="btn btn-sm" onClick={() => { setSearch(''); setFilterClient(''); setFilterDesigner(''); setFilterDeadline('') }}>Clear ✕</button>
          )}
        </div>

        {/* Task form modal */}
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
                <label className="field-label">SOW Month *</label>
                <select className="field-select" value={form.sowMonth} onChange={e => setForm(f => ({ ...f, sowMonth: e.target.value }))}>
                  <option value="">Select month…</option>
                  {SOW_MONTHS().map(m => <option key={m}>{m}</option>)}
                </select>
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

        {filtered.length === 0 ? (
          <div className="empty">No tasks match these filters.</div>
        ) : (
          Object.entries(grouped).map(([client, clientTasks]) => (
            <div key={client} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{client}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '2px 8px', background: 'var(--surface2)', borderRadius: '20px' }}>
                  {clientTasks.length} task{clientTasks.length > 1 ? 's' : ''}
                  {clientTasks.filter(t => new Date(t.deadline) < new Date() && !approvedTaskIds.has(t.id)).length > 0 &&
                    <span style={{ color: 'var(--red)', marginLeft: '6px' }}>· {clientTasks.filter(t => new Date(t.deadline) < new Date() && !approvedTaskIds.has(t.id)).length} overdue</span>}
                    {clientTasks.filter(t => approvedTaskIds.has(t.id)).length > 0 && <span style={{ color: '#4ede8c', marginLeft: '6px' }}>· {clientTasks.filter(t => approvedTaskIds.has(t.id)).length} approved</span>}
                </div>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {clientTasks.map(t => (
                  <div key={t.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, marginBottom: '2px' }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span>→ <strong>{t.assignedTo}</strong></span>
                        <span className="tag">{t.deliverableType}</span>
                        <span style={{ color: deadlineColor(t.deadline), fontWeight: 500 }}>
                          {new Date(t.deadline) < new Date() && !approvedTaskIds.has(t.id) ? '⚠ ' : ''}
                          Due {new Date(t.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{approvedTaskIds.has(t.id) ? ' ✅' : ''}
                        </span>
                      </div>
                      {t.brief && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{t.brief}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                      {subStatusMap[t.id] === 'approved' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#4ede8c20', color: '#4ede8c', fontWeight: 700 }}>✓ Approved</span>}
                      {subStatusMap[t.id] === 'pending' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#ff9b4e20', color: '#ff9b4e', fontWeight: 700 }}>⏳ In Review</span>}
                      {subStatusMap[t.id] === 'revision' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#5b9cf620', color: '#5b9cf6', fontWeight: 700 }}>↩ Revision</span>}
                      {subStatusMap[t.id] === 'rejected' && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#ff5f5f20', color: '#ff5f5f', fontWeight: 700 }}>✕ Rejected</span>}
                      {!subStatusMap[t.id] && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'var(--surface2)', color: 'var(--text3)', fontWeight: 600 }}>Not submitted</span>}
                      <button className="btn btn-sm" onClick={() => openEdit(t)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteTask(t.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
