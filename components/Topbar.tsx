'use client'
import { useRouter } from 'next/navigation'

interface TopbarProps {
  userName: string
  userRole: 'designer' | 'pm'
  designerType?: 'video' | 'graphic'
  activeTab: string
  tabs: { label: string; href: string; icon: string }[]
}

export default function Topbar({ userName, userRole, designerType, activeTab, tabs }: TopbarProps) {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    localStorage.removeItem('ms_user')
    router.push('/')
  }

  return (
    <>
      {/* Botanical background */}
      <div className="bg-botanical">
        <svg width="100%" height="100%" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <text x="780" y="430" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="160" fontWeight="600" fill="#7DC242" opacity="0.07" transform="rotate(-12 780 500)">meraki</text>
          <text x="820" y="590" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="160" fontWeight="600" fill="#29ABE2" opacity="0.08" transform="rotate(-12 820 560)">ads</text>
          <path d="M -10 120 Q 20 70 70 50 Q 60 90 -10 120 Z" fill="#C5E89A" opacity="0.5"/>
          <path d="M 20 150 Q 55 90 100 75 Q 85 115 20 150 Z" fill="#97C459" opacity="0.38"/>
          <path d="M -5 80 Q 30 40 75 30 Q 60 65 -5 80 Z" fill="#C0DD97" opacity="0.35"/>
          <path d="M 35 170 Q 45 110 55 45" stroke="#639922" strokeWidth="1.2" fill="none" opacity="0.35" strokeLinecap="round"/>
          <circle cx="55" cy="38" r="5" fill="#29ABE2" opacity="0.38"/>
          <path d="M 1450 80 Q 1410 40 1370 30 Q 1375 65 1450 80 Z" fill="#C5E89A" opacity="0.5"/>
          <path d="M 1430 120 Q 1385 75 1345 65 Q 1355 100 1430 120 Z" fill="#97C459" opacity="0.38"/>
          <path d="M 1395 145 Q 1388 90 1378 28" stroke="#639922" strokeWidth="1.2" fill="none" opacity="0.35" strokeLinecap="round"/>
          <path d="M -10 820 Q 30 770 80 755 Q 70 795 -10 820 Z" fill="#C5E89A" opacity="0.45"/>
          <path d="M 1450 830 Q 1405 785 1365 775 Q 1372 808 1450 830 Z" fill="#C5E89A" opacity="0.45"/>
          <circle cx="350" cy="80" r="2" fill="#29ABE2" opacity="0.18"/>
          <circle cx="900" cy="120" r="2.5" fill="#7DC242" opacity="0.16"/>
          <circle cx="700" cy="850" r="3" fill="#97C459" opacity="0.18"/>
        </svg>
      </div>

      <div className="bg-content">
        <div className="topbar">
          <span className="logo"><span className="lm">makers</span><span className="la">studio</span></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {userRole === 'pm' && <span className="badge badge-pm">PM</span>}
            {designerType === 'video' && <span className="badge badge-video">Video</span>}
            {designerType === 'graphic' && <span className="badge badge-graphic">Graphic</span>}
            <div className="avatar">{userName.slice(0, 2).toUpperCase()}</div>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{userName}</span>
            <button className="btn btn-sm" onClick={logout}><i className="ti ti-logout" /> Sign out</button>
          </div>
        </div>
        <div className="nav-tabs">
          {tabs.map(t => (
            <a key={t.href} href={t.href} className={`nav-tab ${activeTab === t.href ? 'active' : ''}`}>
              <i className={`ti ${t.icon}`} /> {t.label}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}
