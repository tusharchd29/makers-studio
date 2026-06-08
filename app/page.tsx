'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const USERS = ['Anshu', 'Amit', 'Himanshu', 'Ranjeet', 'PM']

export default function LoginPage() {
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function doLogin(name: string, p: string) {
    if (!name) { setError('Select your name first'); return }
    if (p.length < 4) { setError('Enter your 4-digit PIN'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin: p }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setPin(''); setError('Wrong PIN. Try again.'); return }
    localStorage.setItem('ms_user', JSON.stringify(data.user))
    if (data.user.role === 'pm') router.push('/pm/dashboard')
    else router.push('/designer/tasks')
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doLogin(selected, pin)
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* Botanical background — same as Postings */}
      <div className="bg-botanical">
        <svg width="100%" height="100%" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <text x="780" y="430" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="160" fontWeight="600" fill="#7DC242" opacity="0.13" transform="rotate(-12 780 500)">meraki</text>
          <text x="820" y="590" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="160" fontWeight="600" fill="#29ABE2" opacity="0.15" transform="rotate(-12 820 560)">ads</text>
          {/* Top-left leaves */}
          <path d="M -10 120 Q 20 70 70 50 Q 60 90 -10 120 Z" fill="#C5E89A" opacity="0.5"/>
          <path d="M -10 120 Q 40 80 70 50" stroke="#7DC242" strokeWidth="1" fill="none" opacity="0.4"/>
          <path d="M 20 150 Q 55 90 100 75 Q 85 115 20 150 Z" fill="#97C459" opacity="0.38"/>
          <path d="M -5 80 Q 30 40 75 30 Q 60 65 -5 80 Z" fill="#C0DD97" opacity="0.35"/>
          <path d="M 35 170 Q 45 110 55 45" stroke="#639922" strokeWidth="1.2" fill="none" opacity="0.35" strokeLinecap="round"/>
          <circle cx="55" cy="38" r="5" fill="#29ABE2" opacity="0.38"/>
          <circle cx="55" cy="38" r="3" fill="#7DC242" opacity="0.5"/>
          <ellipse cx="48" cy="31" rx="5" ry="3" fill="#A8DCF0" opacity="0.4" transform="rotate(-30 48 31)"/>
          <ellipse cx="62" cy="31" rx="5" ry="3" fill="#A8DCF0" opacity="0.4" transform="rotate(30 62 31)"/>
          {/* Top-right leaves */}
          <path d="M 1450 80 Q 1410 40 1370 30 Q 1375 65 1450 80 Z" fill="#C5E89A" opacity="0.5"/>
          <path d="M 1450 80 Q 1400 48 1370 30" stroke="#7DC242" strokeWidth="1" fill="none" opacity="0.4"/>
          <path d="M 1430 120 Q 1385 75 1345 65 Q 1355 100 1430 120 Z" fill="#97C459" opacity="0.38"/>
          <path d="M 1455 50 Q 1415 20 1360 15 Q 1370 48 1455 50 Z" fill="#C0DD97" opacity="0.35"/>
          <path d="M 1395 145 Q 1388 90 1378 28" stroke="#639922" strokeWidth="1.2" fill="none" opacity="0.35" strokeLinecap="round"/>
          <circle cx="1378" cy="20" r="5" fill="#FAC775" opacity="0.45"/>
          {/* Bottom-left leaves */}
          <path d="M -10 820 Q 30 770 80 755 Q 70 795 -10 820 Z" fill="#C5E89A" opacity="0.45"/>
          <path d="M -10 820 Q 45 778 80 755" stroke="#7DC242" strokeWidth="1" fill="none" opacity="0.38"/>
          <path d="M 25 850 Q 65 795 110 785 Q 95 825 25 850 Z" fill="#97C459" opacity="0.35"/>
          {/* Bottom-right leaves */}
          <path d="M 1450 830 Q 1405 785 1365 775 Q 1372 808 1450 830 Z" fill="#C5E89A" opacity="0.45"/>
          <path d="M 1450 830 Q 1400 790 1365 775" stroke="#7DC242" strokeWidth="1" fill="none" opacity="0.38"/>
          {/* Scattered dots */}
          <circle cx="350" cy="80" r="2" fill="#29ABE2" opacity="0.18"/>
          <circle cx="900" cy="120" r="2.5" fill="#7DC242" opacity="0.16"/>
          <circle cx="1100" cy="180" r="2" fill="#29ABE2" opacity="0.18"/>
          <circle cx="700" cy="850" r="3" fill="#97C459" opacity="0.18"/>
        </svg>
      </div>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', gap: '14px', position: 'relative', zIndex: 1 }}>

        {/* Header card with banner */}
        <div style={{ width: '100%', maxWidth: '360px', background: 'rgba(255,255,255,0.82)', borderRadius: '18px', overflow: 'hidden', border: '0.5px solid #e0e0e0' }}>
          <div style={{ height: '3px', background: '#7DC242' }} />
          <svg width="100%" viewBox="0 0 400 180" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
            <rect width="400" height="180" fill="#FDFCF8"/>
            <text x="200" y="72" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="19" fill="#2C2C2A" fontWeight="600">Where creativity meets craft.</text>
            <text x="200" y="100" textAnchor="middle" fontFamily="Dancing Script,cursive" fontSize="19" fill="#2C2C2A" fontWeight="600">Every frame, every reel — delivered.</text>
            <line x1="148" y1="120" x2="252" y2="120" stroke="#C0DD97" strokeWidth="0.8"/>
            <circle cx="200" cy="120" r="2" fill="#7DC242" opacity="0.6"/>
            <text x="200" y="134" textAnchor="middle" fontFamily="Cormorant Garamond,Georgia,serif" fontSize="11" fill="#aaa" fontStyle="italic" letterSpacing="1.5">Meraki Ads</text>
            <rect x="130" y="145" width="140" height="18" rx="9" fill="#EAF3DE"/>
            <text x="200" y="157" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontSize="10" fill="#3B6D11" letterSpacing="0.3">{today}</text>
          </svg>
          <div style={{ height: '3px', background: '#29ABE2' }} />
        </div>

        {/* Login card */}
        <div style={{ background: 'rgba(255,255,255,0.82)', borderRadius: '18px', padding: '1.75rem', width: '100%', maxWidth: '360px', border: '0.5px solid #e0e0e0' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span className="logo"><span className="lm">makers</span><span className="la">studio</span></span>
          </div>
          <p style={{ textAlign: 'center', fontSize: '10px', color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>Creative Asset Portal</p>

          {/* Name selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
            {USERS.map(u => (
              <button key={u} onClick={() => { setSelected(u); setPin(''); setError('') }}
                style={{
                  padding: '14px 10px', border: `1.5px solid ${selected === u ? '#7DC242' : '#e8e8e8'}`,
                  borderRadius: '12px', cursor: 'pointer', background: selected === u ? '#F3FBE8' : '#fafafa',
                  textAlign: 'center', transition: 'all .15s', fontFamily: 'inherit',
                }}>
                <i className={`ti ${u === 'PM' ? 'ti-layout-dashboard' : u === 'Ranjeet' ? 'ti-photo' : 'ti-video'}`}
                  style={{ fontSize: '22px', display: 'block', marginBottom: '5px', color: selected === u ? '#7DC242' : '#ccc' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', color: '#1a1a1a' }}>{u}</span>
                <small style={{ fontSize: '11px', color: '#aaa' }}>
                  {u === 'PM' ? 'Manage & review' : u === 'Ranjeet' ? 'Graphic' : 'Video'}
                </small>
              </button>
            ))}
          </div>

          {/* PIN — keyboard input */}
          <div className="field">
            <label className="field-label">PIN</label>
            <input
              className="field-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Enter your 4-digit PIN"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
              onKeyDown={handleKey}
              autoComplete="off"
              style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '18px' }}
            />
          </div>

          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#991B1B', marginBottom: '10px' }}>{error}</div>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
            onClick={() => doLogin(selected, pin)}
            disabled={loading || !selected || pin.length < 4}
          >
            <i className="ti ti-login" />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </>
  )
}
