'use client'
import React from 'react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { Task, DELIVERABLE_TYPES, SOW_MONTHS } from '@/lib/types'

interface AsanaTask {
  gid:         string
  name:        string
  due_on:      string | null
  notes:       string
  projectName: string
}

const PM_TABS = [
  { label: 'Dashboard',    href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review',    icon: 'ti-eye-check' },
  { label: 'Creatives',    href: '/pm/creatives', icon: 'ti-photo-check' },
  { label: 'Tasks',        href: '/pm/tasks',     icon: 'ti-checklist' },
  { label: 'SOW',          href: '/pm/sow',       icon: 'ti-file-description' },
]

interface Client { id: string; name: string }
const DESIGNERS = ['Anshu', 'Amit', 'Himanshu', 'Ranjeet']

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  'not-submitted': { label: 'Not Submitted', color: 'var(--text3)', bg: 'var(--surface2)' },
  pending:         { label: 'In Review',     color: '#ff9b4e',      bg: '#ff9b4e18' },
  approved:        { label: 'Approved',      color: '#4ede8c',      bg: '#4ede8c18' },
  revision:        { label: 'Needs Revision',color: '#5b9cf6',      bg: '#5b9cf618' },
  rejected:        { label: 'Rejected',      color: '#ff5f5f',      bg: '#ff5f5f18' },
}

function deadlineLabel(d: string, approved: boolean) {
  if (approved) return '✓ Done'
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}

function deadlineColor(d: string, approved: boolean) {
  if (approved) return '#4ede8c'
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'var(--red)'
  if (diff <= 2) return 'var(--orange)'
  return 'var(--text2)'
}

export default function PMTasksPage() {
  const [user, setUser]       = useState<{ name: string; role: string } | null>(null)
  const [tasks, setTasks]     = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [subStatusMap, setSubStatusMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [form, setForm] = useState({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '', sowMonth: '', taskStatus: 'not-started', holdReason: '', priority: 'none', pmNotes: '' })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'studio' | 'asana'>('studio')
  const [syncStatus, setSyncStatus] = useState<Record<string, 'syncing' | 'synced' | 'failed'>>({})
  const [asanaTasks, setAsanaTasks] = useState<AsanaTask[]>([])
  const [asanaLoading, setAsanaLoading] = useState(false)
  const [asanaError, setAsanaError] = useState('')
  const [importing, setImporting] = useState<string | null>(null) // gid being imported
  const [importForm, setImportForm] = useState<Record<string, { deliverableType: string; assignedTo: string; sowMonth: string; brief: string }>>({})
  // Asana tab filters
  const [reopenModal, setReopenModal] = useState<Task | null>(null)
  const [reopenAssignTo, setReopenAssignTo] = useState('')
  const [asanaFilterClient, setAsanaFilterClient] = useState('')
  const [asanaFilterDue, setAsanaFilterDue]       = useState<'all' | 'overdue' | 'this-week' | 'upcoming' | 'no-date'>('all')
  const [asanaSearch, setAsanaSearch]             = useState('')
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterDesigner, setFilterDesigner] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const router = useRouter()

  const loadData = useCallback(() => {
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/submissions').then(r => r.json()),
    ]).then(([t, c, subs]) => {
      if (Array.isArray(t)) setTasks(t)
      if (Array.isArray(c)) setClients(c)
      if (Array.isArray(subs)) {
        const map: Record<string, string> = {}
        subs.forEach((s: { taskId: string; status: string }) => { map[s.taskId] = s.status })
        setSubStatusMap(map)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ms_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.role !== 'pm') { router.push('/designer/tasks'); return }
    setUser(u)
    loadData()
  }, [router, loadData])

  const loadAsanaTasks = async () => {
    setAsanaLoading(true); setAsanaError('')
    try {
      const res = await fetch('/api/asana-tasks')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAsanaTasks(Array.isArray(data) ? data : [])
      // Init import forms for each task
      const forms: Record<string, { deliverableType: string; assignedTo: string; sowMonth: string; brief: string }> = {}
      for (const t of data) {
        forms[t.gid] = { deliverableType: 'Reel', assignedTo: 'Anshu', sowMonth: SOW_MONTHS()[1] || '', brief: t.notes || '' }
      }
      setImportForm(forms)
    } catch {
      setAsanaError('Could not load Asana tasks. Check ASANA_PAT env var.')
    } finally {
      setAsanaLoading(false)
    }
  }

  const importAsanaTask = async (t: AsanaTask) => {
    const form = importForm[t.gid]
    if (!form || !form.deliverableType || !form.assignedTo) return
    setImporting(t.gid)
    const client = clients.find(c =>
      c.name.toLowerCase().includes(t.projectName.toLowerCase()) ||
      t.projectName.toLowerCase().includes(c.name.toLowerCase())
    ) || { id: t.projectName.toLowerCase().replace(/\s+/g, '-'), name: t.projectName }
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asanaGid:        t.gid,
          clientId:        client.id,
          clientName:      client.name,
          name:            t.name,
          deliverableType: form.deliverableType,
          assignedTo:      form.assignedTo,
          deadline:        t.due_on || '',
          brief:           form.brief,
          sowMonth:        form.sowMonth,
        }),
      })
      const saved = await res.json()
      // Show sync status on the studio task card
      setSyncStatus(s => ({ ...s, [saved.id]: saved.asanaSynced ? 'synced' : 'failed' }))
      setTasks(prev => [saved, ...prev])
      setAsanaTasks(prev => prev.filter(a => a.gid !== t.gid))
    } finally {
      setImporting(null)
    }
  }

  function openNew() {
    setEditTask(null)
    setForm({ clientId: '', name: '', deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '', brief: '', sowMonth: '', taskStatus: 'not-started', holdReason: '', priority: 'none', pmNotes: '' })
    setShowForm(true)
  }
  function openEdit(t: Task) {
    setEditTask(t)
    setForm({ clientId: t.clientId, name: t.name, deliverableType: t.deliverableType, assignedTo: t.assignedTo, deadline: t.deadline.split('T')[0], brief: t.brief || '', sowMonth: t.sowMonth || '', taskStatus: t.taskStatus || 'not-started', holdReason: t.holdReason || '', priority: t.priority || 'none', pmNotes: t.pmNotes || '' })
    setShowForm(true)
  }

  async function saveTask() {
    if (!form.clientId || !form.name || !form.deadline) return
    setSaving(true)
    const client = clients.find(c => c.id === form.clientId)!
    const body = editTask
      ? { ...editTask, ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'] }
      : { ...form, clientName: client.name, deliverableType: form.deliverableType as Task['deliverableType'] }
    // Mark syncing if this task has an asanaGid
    const bodyAsTask = body as Task
    if (bodyAsTask.asanaGid) setSyncStatus(s => ({ ...s, [bodyAsTask.id || '']: 'syncing' }))
    const res = await fetch('/api/tasks', {
      method: editTask ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const saved = await res.json()
    // Update sync status based on response
    if (saved.asanaGid) {
      setSyncStatus(s => ({ ...s, [saved.id]: saved.asanaSynced ? 'synced' : 'failed' }))
    }
    setTasks(prev => editTask ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev])
    setShowForm(false); setSaving(false)
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // Stats
  const stats = useMemo(() => {
    const approved = tasks.filter(t => subStatusMap[t.id] === 'approved').length
    const pending  = tasks.filter(t => subStatusMap[t.id] === 'pending').length
    const revision = tasks.filter(t => subStatusMap[t.id] === 'revision').length
    const notSub   = tasks.filter(t => !subStatusMap[t.id]).length
    const overdue  = tasks.filter(t => new Date(t.deadline) < new Date() && subStatusMap[t.id] !== 'approved').length
    return { total: tasks.length, approved, pending, revision, notSub, overdue }
  }, [tasks, subStatusMap])

  const filtered = useMemo(() => tasks.filter(t => {
    const status = subStatusMap[t.id] || 'not-submitted'
    if (filterClient   && t.clientName  !== filterClient)   return false
    if (filterDesigner && t.assignedTo  !== filterDesigner) return false
    if (filterStatus   && status        !== filterStatus)   return false
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.clientName.toLowerCase().includes(q) && !t.assignedTo.toLowerCase().includes(q)) return false
    }
    return true
  }), [tasks, subStatusMap, filterClient, filterDesigner, filterStatus, search])

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {}
    filtered.forEach(t => {
      if (!map[t.clientName]) map[t.clientName] = []
      map[t.clientName].push(t)
    })
    return map
  }, [filtered])

  if (!user) return null

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/tasks" tabs={PM_TABS} />
      <div className="page">

        {/* Stats row */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '16px' }}>
            {[
              { label: 'Total',        val: stats.total,    color: 'var(--text)',  filter: '' },
              { label: 'Not Submitted',val: stats.notSub,   color: 'var(--text2)', filter: 'not-submitted' },
              { label: 'In Review',    val: stats.pending,  color: '#ff9b4e',      filter: 'pending' },
              { label: 'Revision',     val: stats.revision, color: '#5b9cf6',      filter: 'revision' },
              { label: 'Approved',     val: stats.approved, color: '#4ede8c',      filter: 'approved' },
              { label: 'Overdue',      val: stats.overdue,  color: stats.overdue > 0 ? '#ff5f5f' : 'var(--text3)', filter: '' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ cursor: s.filter ? 'pointer' : 'default', padding: '10px 8px' }}
                onClick={() => s.filter && setFilterStatus(filterStatus === s.filter ? '' : s.filter)}>
                <div className="stat-value" style={{ color: s.color, fontSize: '20px' }}>{s.val}</div>
                <div className="stat-label" style={{ fontSize: '10px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Header + inline filters */}
        {/* Tab switcher: Studio Tasks vs From Asana */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surface2)', padding: '3px', borderRadius: '10px' }}>
            <button
              onClick={() => setActiveTab('studio')}
              style={{ padding: '5px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                background: activeTab === 'studio' ? '#fff' : 'transparent',
                color: activeTab === 'studio' ? 'var(--text)' : 'var(--text3)',
                boxShadow: activeTab === 'studio' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              Studio Tasks <span style={{ marginLeft: '4px', opacity: 0.6 }}>{tasks.length}</span>
            </button>
            <button
              onClick={() => { setActiveTab('asana'); if (asanaTasks.length === 0 && !asanaLoading) loadAsanaTasks() }}
              style={{ padding: '5px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                background: activeTab === 'asana' ? '#fff' : 'transparent',
                color: activeTab === 'asana' ? 'var(--text)' : 'var(--text3)',
                boxShadow: activeTab === 'asana' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              From Asana {asanaTasks.length > 0 && <span style={{ marginLeft: '4px', background: '#7DC242', color: '#fff', borderRadius: '20px', padding: '1px 6px', fontSize: '10px' }}>{asanaTasks.length}</span>}
            </button>
          </div>
          {activeTab === 'studio' && <button className="btn btn-sm btn-primary" onClick={openNew}>+ New Task</button>}
          {activeTab === 'asana'  && <button className="btn btn-sm" onClick={loadAsanaTasks} disabled={asanaLoading}>{asanaLoading ? 'Loading…' : '↻ Refresh'}</button>}
        </div>

        {activeTab === 'studio' && (<>{/* Inline filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '13px' }} />
            <input className="field-input" placeholder="Search tasks, client, designer…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '30px', width: '100%' }} />
          </div>
          <select className="field-select" value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ minWidth: '140px' }}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id}>{c.name}</option>)}
          </select>
          <select className="field-select" value={filterDesigner} onChange={e => setFilterDesigner(e.target.value)} style={{ minWidth: '120px' }}>
            <option value="">All designers</option>
            {DESIGNERS.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="field-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: '130px' }}>
            <option value="">All statuses</option>
            <option value="not-submitted">Not Submitted</option>
            <option value="pending">In Review</option>
            <option value="revision">Revision</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          {(search || filterClient || filterDesigner || filterStatus) && (
            <button className="btn btn-sm" onClick={() => { setSearch(''); setFilterClient(''); setFilterDesigner(''); setFilterStatus('') }}>Clear ✕</button>
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
                <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Honda June Reel" />
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
                <label className="field-label">SOW Month</label>
                <select className="field-select" value={form.sowMonth} onChange={e => setForm(f => ({ ...f, sowMonth: e.target.value }))}>
                  <option value="">Select month…</option>
                  {SOW_MONTHS().map((m: string) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Brief for designer</label>
                <textarea className="field-textarea" value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} placeholder="Specific instructions, references, tone…" />
              </div>
              <div className="row">
                <div className="col field">
                  <label className="field-label">Task Status</label>
                  <select className="field-select" value={form.taskStatus} onChange={e => setForm(f => ({ ...f, taskStatus: e.target.value }))}>
                    <option value="not-started">Not Started</option>
                    <option value="processing">Processing</option>
                    <option value="hold">On Hold</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div className="col field" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <div style={{ width: '100%' }}>
                    <label className="field-label">Priority</label>
                    <select className="field-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                      <option value="none">— None</option>
                      <option value="high">🔴 High Priority</option>
                    </select>
                  </div>
                </div>
              </div>
              {form.taskStatus === 'hold' && (
                <div className="field">
                  <label className="field-label">Hold Reason *</label>
                  <input className="field-input" value={form.holdReason} onChange={e => setForm(f => ({ ...f, holdReason: e.target.value }))} placeholder="Why is this on hold? (visible to designer)" />
                </div>
              )}
              <div className="field">
                <label className="field-label">PM Notes (visible to designer)</label>
                <textarea className="field-textarea" value={form.pmNotes} onChange={e => setForm(f => ({ ...f, pmNotes: e.target.value }))} placeholder="Internal notes, client expectations, references…" style={{ minHeight: '56px' }} />
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

        {loading ? (
          <div className="empty">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {tasks.length === 0
              ? <><div style={{ marginBottom: '12px' }}>No tasks yet.</div><button className="btn btn-primary btn-sm" onClick={openNew}>+ Create your first task</button></>
              : 'No tasks match these filters.'}
          </div>
        ) : (
          Object.entries(grouped).map(([client, clientTasks]) => {
            const clientApproved = clientTasks.filter(t => subStatusMap[t.id] === 'approved').length
            const clientPending  = clientTasks.filter(t => subStatusMap[t.id] === 'pending').length
            const clientOverdue  = clientTasks.filter(t => new Date(t.deadline) < new Date() && subStatusMap[t.id] !== 'approved').length
            return (
              <div key={client} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{client}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '6px' }}>
                    <span style={{ padding: '1px 7px', background: 'var(--surface2)', borderRadius: '20px' }}>{clientTasks.length} task{clientTasks.length > 1 ? 's' : ''}</span>
                    {clientApproved > 0 && <span style={{ padding: '1px 7px', background: '#4ede8c18', color: '#4ede8c', borderRadius: '20px', fontWeight: 600 }}>✓ {clientApproved}</span>}
                    {clientPending > 0  && <span style={{ padding: '1px 7px', background: '#ff9b4e18', color: '#ff9b4e', borderRadius: '20px', fontWeight: 600 }}>⏳ {clientPending}</span>}
                    {clientOverdue > 0  && <span style={{ padding: '1px 7px', background: '#ff5f5f18', color: '#ff5f5f', borderRadius: '20px', fontWeight: 600 }}>⚠ {clientOverdue}</span>}
                  </div>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {clientTasks.map(t => {
                    const status = subStatusMap[t.id] || 'not-submitted'
                    const isApproved = status === 'approved'
                    const sm = STATUS_META[status] || STATUS_META['not-submitted']
                    return (
                      <div key={t.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${sm.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, marginBottom: '3px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.priority && <span title="High Priority" style={{ color: '#ff9b4e', fontSize: '12px' }}>🔴</span>}
                            {t.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span>→ <strong>{t.assignedTo}</strong></span>
                            <span className="tag">{t.deliverableType}</span>
                            {t.sowMonth && <span className="tag" style={{ background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #C0DD97' }}>{t.sowMonth}</span>}
                            <span style={{ color: deadlineColor(t.deadline, isApproved), fontWeight: 500 }}>
                              {deadlineLabel(t.deadline, isApproved)}
                            </span>
                            {/* Task workflow status badge */}
                            {t.taskStatus && t.taskStatus !== 'not-started' && (() => {
                              const ts = t.taskStatus as string
                              const tsMeta: Record<string, { label: string; color: string; bg: string }> = {
                                processing: { label: '⚙ Processing', color: '#5b9cf6', bg: '#5b9cf618' },
                                hold: { label: '⏸ On Hold', color: '#ff9b4e', bg: '#ff9b4e18' },
                                done: { label: '✓ Done', color: '#4ede8c', bg: '#4ede8c18' },
                              }
                              const meta = tsMeta[ts]
                              return meta ? (
                                <span style={{ padding: '1px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.label}</span>
                              ) : null
                            })()}
                          </div>
                          {t.holdReason && t.taskStatus === 'hold' && (
                            <div style={{ fontSize: '11px', color: '#ff9b4e', marginTop: '3px', padding: '3px 8px', background: '#ff9b4e10', borderRadius: '4px', fontStyle: 'italic' }}>
                              Hold: {t.holdReason}
                            </div>
                          )}
                          {t.pmNotes && (
                            <div style={{ fontSize: '11px', color: '#5b9cf6', marginTop: '3px', padding: '3px 8px', background: '#5b9cf610', borderRadius: '4px' }}>
                              📝 {t.pmNotes}
                            </div>
                          )}
                          {t.brief && t.brief.length < 120 && !t.pmNotes && (
                            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px', fontStyle: 'italic' }}>{t.brief}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: sm.bg, color: sm.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {sm.label}
                          </span>
                          {/* Asana sync status badge */}
                          {t.asanaGid && syncStatus[t.id] === 'syncing' && (
                            <span style={{ fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FAC775', display: 'inline-block' }} />Syncing…</span>
                          )}
                          {t.asanaGid && syncStatus[t.id] === 'failed' && (
                            <span title="Asana sync failed — edit and save to retry" style={{ fontSize: 10, color: '#ff5f5f', display: 'flex', alignItems: 'center', gap: 3, cursor: 'help' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5f5f', display: 'inline-block' }} />Sync failed</span>
                          )}
                          {t.asanaGid && syncStatus[t.id] === 'synced' && (
                            <span style={{ fontSize: 10, color: '#4ede8c', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ede8c', display: 'inline-block' }} />Synced</span>
                          )}
                          {t.asanaGid && !syncStatus[t.id] && (
                            <span title={`Linked to Asana task ${t.asanaGid}`} style={{ fontSize: 10, color: '#29ABE2', display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#29ABE2', display: 'inline-block' }} />Asana linked</span>
                          )}
                          {/* PM Status: Ready to Post / Posted — only show after task is done */}
                          {(t.taskStatus === 'done' || t.pmStatus) && (
                            <select
                              value={t.pmStatus || ''}
                              onChange={async e => {
                                const val = e.target.value
                                const res = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, pmStatus: val }) })
                                const data = await res.json()
                                if (data.ok) {
                                  setTasks(prev => prev.map(x => x.id === t.id ? { ...x, pmStatus: val as never, postingId: data.task?.postingId } : x))
                                }
                              }}
                              style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '6px', border: '1px solid #a855f740', background: t.pmStatus === 'posted' ? '#22c55e18' : t.pmStatus === 'ready-to-post' ? '#a855f718' : 'var(--surface)', color: t.pmStatus === 'posted' ? '#22c55e' : t.pmStatus === 'ready-to-post' ? '#a855f7' : 'var(--text2)', cursor: 'pointer', fontWeight: t.pmStatus ? 700 : 400 }}
                            >
                              <option value="">— PM Status</option>
                              <option value="ready-to-post">🟣 Ready to Post</option>
                              <option value="posted">✅ Posted</option>
                            </select>
                          )}
                          {t.postingId && (
                            <span title={`Postings ID: ${t.postingId}`} style={{ fontSize: 10, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />In Postings
                            </span>
                          )}
                          <button className="btn btn-sm" onClick={() => openEdit(t)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteTask(t.id)}>Delete</button>
                          {/* PM can reopen any task back to processing */}
                          {(isApproved || t.taskStatus === 'done') && (
                            <button
                              className="btn btn-sm"
                              style={{ color: '#ff9b4e', borderColor: '#ff9b4e40' }}
                              onClick={() => { setReopenModal(t); setReopenAssignTo(t.assignedTo) }}
                            >↺ Reopen</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </>)}

        {/* ── From Asana Tab ────────────────────────────────────── */}
        {activeTab === 'asana' && (
          <div>
            {asanaError && (
              <div style={{ background: '#FEF2F2', border: '0.5px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 12, marginBottom: 14 }}>
                {asanaError}
              </div>
            )}
            {asanaLoading ? (
              <div className="empty">Fetching tasks from Asana…</div>
            ) : asanaTasks.length === 0 ? (
              <div className="empty">
                <div style={{ marginBottom: 8 }}>No pending Asana tasks to import.</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>All tasks are already in Makers Studio, or Asana has no incomplete tasks.</div>
              </div>
            ) : (
              <>
              {/* Asana filter bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                  <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13 }} />
                  <input className="field-input" placeholder="Search tasks…" value={asanaSearch}
                    onChange={e => setAsanaSearch(e.target.value)}
                    style={{ paddingLeft: 30, width: '100%' }} />
                </div>
                <select className="field-select" value={asanaFilterClient} onChange={e => setAsanaFilterClient(e.target.value)} style={{ minWidth: 140 }}>
                  <option value="">All clients</option>
                  {[...new Set(asanaTasks.map(t => t.projectName))].sort().map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select className="field-select" value={asanaFilterDue} onChange={e => setAsanaFilterDue(e.target.value as 'all'|'overdue'|'this-week'|'upcoming'|'no-date')} style={{ minWidth: 130 }}>
                  <option value="all">All dates</option>
                  <option value="overdue">Overdue</option>
                  <option value="this-week">This week</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="no-date">No due date</option>
                </select>
                {(asanaFilterClient || asanaFilterDue !== 'all' || asanaSearch) && (
                  <button className="btn btn-sm" onClick={() => { setAsanaFilterClient(''); setAsanaFilterDue('all'); setAsanaSearch('') }}>Clear ✕</button>
                )}
                <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
                  {asanaTasks.filter(t => {
                    const today = new Date().toISOString().split('T')[0]
                    const weekEnd = new Date(Date.now() + 7*86400000).toISOString().split('T')[0]
                    if (asanaFilterClient && t.projectName !== asanaFilterClient) return false
                    if (asanaSearch && !t.name.toLowerCase().includes(asanaSearch.toLowerCase())) return false
                    if (asanaFilterDue === 'overdue')   return t.due_on != null && t.due_on < today
                    if (asanaFilterDue === 'this-week') return t.due_on != null && t.due_on >= today && t.due_on <= weekEnd
                    if (asanaFilterDue === 'upcoming')  return t.due_on != null && t.due_on > weekEnd
                    if (asanaFilterDue === 'no-date')   return !t.due_on
                    return true
                  }).length} tasks
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {asanaTasks.filter(t => {
                  const today = new Date().toISOString().split('T')[0]
                  const weekEnd = new Date(Date.now() + 7*86400000).toISOString().split('T')[0]
                  if (asanaFilterClient && t.projectName !== asanaFilterClient) return false
                  if (asanaSearch && !t.name.toLowerCase().includes(asanaSearch.toLowerCase())) return false
                  if (asanaFilterDue === 'overdue')   return t.due_on != null && t.due_on < today
                  if (asanaFilterDue === 'this-week') return t.due_on != null && t.due_on >= today && t.due_on <= weekEnd
                  if (asanaFilterDue === 'upcoming')  return t.due_on != null && t.due_on > weekEnd
                  if (asanaFilterDue === 'no-date')   return !t.due_on
                  return true
                }).map(t => {
                  const form = importForm[t.gid] || { deliverableType: 'Reel', assignedTo: 'Anshu', sowMonth: '', brief: '' }
                  const isImporting = importing === t.gid
                  return (
                    <div key={t.gid} className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #29ABE2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ background: '#E6F1FB', color: '#185FA5', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>{t.projectName}</span>
                            {t.due_on && ((): React.ReactNode => {
                              const today = new Date().toISOString().split('T')[0]
                              const diff = Math.ceil((new Date(t.due_on).getTime() - Date.now()) / 86400000)
                              if (t.due_on < today) return <span style={{ color: '#ff5f5f', fontWeight: 600 }}>⚠ Overdue ({Math.abs(diff)}d)</span>
                              if (diff === 0) return <span style={{ color: '#D97706', fontWeight: 600 }}>Due today</span>
                              if (diff <= 3)  return <span style={{ color: '#D97706' }}>Due in {diff}d</span>
                              return <span>Due {t.due_on}</span>
                            })()}
                          </div>
                          {t.notes && t.notes.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.notes.split('\n')[0]}
                            </div>
                          )}
                        </div>
                        {/* Import controls */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Type</div>
                            <select className="field-select" style={{ fontSize: 11, padding: '4px 8px', minWidth: 90 }}
                              value={form.deliverableType}
                              onChange={e => setImportForm(f => ({ ...f, [t.gid]: { ...form, deliverableType: e.target.value } }))}>
                              {['Reel','Story','Static','Carousel','YouTube Short','Product Video','Photo'].map((d: string) => <option key={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Assign to</div>
                            <select className="field-select" style={{ fontSize: 11, padding: '4px 8px', minWidth: 90 }}
                              value={form.assignedTo}
                              onChange={e => setImportForm(f => ({ ...f, [t.gid]: { ...form, assignedTo: e.target.value } }))}>
                              {['Anshu','Amit','Himanshu','Ranjeet'].map(d => <option key={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>SOW Month</div>
                            <select className="field-select" style={{ fontSize: 11, padding: '4px 8px', minWidth: 100 }}
                              value={form.sowMonth}
                              onChange={e => setImportForm(f => ({ ...f, [t.gid]: { ...form, sowMonth: e.target.value } }))}>
                              <option value="">Select…</option>
                              {SOW_MONTHS().map((m: string) => <option key={m}>{m}</option>)}
                            </select>
                          </div>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={isImporting || !form.deliverableType || !form.assignedTo}
                            onClick={() => importAsanaTask(t)}
                            style={{ alignSelf: 'flex-end' }}>
                            {isImporting ? 'Importing…' : '⬇ Import'}
                          </button>
                        </div>
                      </div>
                      {/* Brief field */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Brief for designer (editable before import)</div>
                        <textarea className="field-textarea" style={{ fontSize: 11, minHeight: 48 }}
                          value={form.brief}
                          onChange={e => setImportForm(f => ({ ...f, [t.gid]: { ...form, brief: e.target.value } }))}
                          placeholder="Add or edit brief…" />
                      </div>
                    </div>
                  )
                })}
              </div>
              </>
            )}
          </div>
        )}
      </div>

{/* ── Reopen Modal ─────────────────────────────────────── */}
        {reopenModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(2px)' }}>
            <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>↺ Reopen Task</h3>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text2)' }}>
                <strong>{reopenModal.name}</strong> — {reopenModal.clientName}
              </p>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label className="field-label">Reassign To</label>
                <select
                  className="field-select"
                  value={reopenAssignTo}
                  onChange={e => setReopenAssignTo(e.target.value)}
                >
                  {['Anshu', 'Amit', 'Ranjeet', 'Himanshu'].map(d => (
                    <option key={d} value={d}>
                      {d}{d === reopenModal.assignedTo ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {reopenAssignTo !== reopenModal.assignedTo && (
                <div style={{ padding: '8px 12px', background: '#ff9b4e12', border: '1px solid #ff9b4e30', borderRadius: '8px', fontSize: '12px', color: '#ff9b4e', marginBottom: '16px' }}>
                  ⚠️ Reassigning from <strong>{reopenModal.assignedTo}</strong> → <strong>{reopenAssignTo}</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setReopenModal(null); setReopenAssignTo('') }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '13px' }}
                >Cancel</button>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/tasks', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: reopenModal.id, reopen: true, assignedTo: reopenAssignTo }),
                    })
                    const data = await res.json()
                    if (data.ok) {
                      setTasks(prev => prev.map(x => x.id === reopenModal.id
                        ? { ...x, taskStatus: 'processing' as never, assignedTo: reopenAssignTo, pmStatus: undefined, postingId: undefined }
                        : x
                      ))
                    }
                    setReopenModal(null)
                    setReopenAssignTo('')
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#ff9b4e', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >↺ Confirm Reopen</button>
              </div>
            </div>
          </div>
        )}
    </>
  )
}
