'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import { SOWEntry } from '@/lib/types'

const PM_TABS = [
  { label: 'Dashboard', href: '/pm/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Review Queue', href: '/pm/review', icon: 'ti-eye-check' },
  { label: 'Tasks', href: '/pm/tasks', icon: 'ti-checklist' },
  { label: 'SOW', href: '/pm/sow', icon: 'ti-file-description' },
  { label: 'Clients', href: '/pm/clients', icon: 'ti-building' },
]

interface Submission { status: string; clientName: string; submittedAt: string; deliverableType: string }
interface Client { id: string; name: string }

export default function PMDashboard() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [sow, setSOW] = useState<SOWEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
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
    ]).then(([subs, sowData, clientsData]) => {
      if (Array.isArray(subs)) setSubmissions(subs)
      if (Array.isArray(sowData)) setSOW(sowData)
      if (Array.isArray(clientsData)) setClients(clientsData)
    })
  }, [router])

  if (!user) return null

  const pending = submissions.filter(s => s.status === 'pending').length
  const approved = submissions.filter(s => s.status === 'approved').length
  const rejected = submissions.filter(s => s.status === 'rejected').length
  const revision = submissions.filter(s => s.status === 'revision').length

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  function getSOWProgress(sowEntry: SOWEntry) {
    const clientSubs = submissions.filter(s => {
      const c = clients.find(cl => cl.id === sowEntry.clientId)
      return c && s.clientName === c.name && s.status === 'approved'
    })
    const countBy = (type: string) => clientSubs.filter(s => s.deliverableType === type).length
    return {
      reels: countBy('Reel'), stories: countBy('Story'),
      statics: countBy('Static'), videos: countBy('Product Video'),
      photos: countBy('Photo'), carousels: countBy('Carousel'),
    }
  }

  function totalPct(entry: SOWEntry) {
    const p = getSOWProgress(entry)
    const total = entry.reels + entry.stories + entry.statics + entry.videos + entry.photos + entry.carousels + entry.youtubeShorts
    const done = p.reels + p.stories + p.statics + p.videos + p.photos + p.carousels
    return total > 0 ? Math.round((done / total) * 100) : 0
  }

  const barColors = ['#c8f55a', '#5b9cf6', '#ff9b4e', '#4ede8c', '#ff5f5f', '#a78bfa']

  return (
    <>
      <Topbar userName={user.name} userRole="pm" activeTab="/pm/dashboard" tabs={PM_TABS} />
      <div className="page">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Pending Review</div>
            <div className="stat-value" style={{ color: 'var(--orange)' }}>{pending}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Approved</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{approved}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Revision</div>
            <div className="stat-value" style={{ color: 'var(--blue)' }}>{revision}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Rejected</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>{rejected}</div>
          </div>
        </div>

        <div className="section-header">
          <div className="section-title">SOW Progress — {currentMonth}</div>
          <a href="/pm/sow" className="btn btn-sm">Manage SOW</a>
        </div>

        {sow.length === 0 ? (
          <div className="empty">No SOW defined yet. <a href="/pm/sow" style={{ color: 'var(--accent)' }}>Set up SOW →</a></div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {sow.map((entry, i) => {
              const client = clients.find(c => c.id === entry.clientId)
              if (!client) return null
              const pct = totalPct(entry)
              const p = getSOWProgress(entry)
              return (
                <div key={entry.clientId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 500 }}>{client.name}</div>
                    <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      {entry.reels > 0 && `Reels ${p.reels}/${entry.reels} · `}
                      {entry.stories > 0 && `Stories ${p.stories}/${entry.stories} · `}
                      {entry.statics > 0 && `Statics ${p.statics}/${entry.statics} · `}
                      {entry.videos > 0 && `Videos ${p.videos}/${entry.videos}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="progress-bg" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: barColors[i % barColors.length] }} />
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text2)', minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {pending > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div className="section-header">
              <div className="section-title" style={{ color: 'var(--orange)' }}>⚡ {pending} pending review</div>
              <a href="/pm/review" className="btn btn-sm btn-warning">Review Now</a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
