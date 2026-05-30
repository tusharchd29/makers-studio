'use client'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  userName: string
  userRole: 'designer' | 'pm'
  designerType?: 'video' | 'graphic'
  activeTab: string
  tabs: { label: string; href: string }[]
}

export default function Topbar({ userName, userRole, designerType, activeTab, tabs }: TopbarProps) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/')
  }

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <div className="logo-dot" />
          Makers Studio
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {userRole === 'pm' && <span className="badge badge-pm">PM</span>}
          {designerType === 'video' && <span className="badge badge-video">Video</span>}
          {designerType === 'graphic' && <span className="badge badge-graphic">Graphic</span>}
          <div className="avatar">{userName.slice(0, 2).toUpperCase()}</div>
          <span style={{ fontSize: '13px' }}>{userName}</span>
          <button className="btn btn-sm" onClick={logout} style={{ marginLeft: '4px' }}>Sign out</button>
        </div>
      </div>
      <div className="nav-tabs">
        {tabs.map(t => (
          <a key={t.href} href={t.href} className={`nav-tab ${activeTab === t.href ? 'active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>
    </>
  )
}
