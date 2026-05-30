'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const USERS = ['Anshu', 'Amit', 'Ranjeet', 'PM']

export default function LoginPage() {
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function doLogin(name: string, p: string) {
    if (!name) { setError('Select your name first'); setPin(''); return }
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

  function pressNum(n: string) {
    if (pin.length >= 4) return
    const next = pin + n
    setPin(next)
    if (next.length === 4) setTimeout(() => doLogin(selected, next), 80)
  }

  function pressBack() { setPin(p => p.slice(0, -1)); setError('') }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '340px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="logo" style={{ justifyContent: 'center', marginBottom: '6px' }}>
            <div className="logo-dot" />
            Makers Studio
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Meraki Ads · Creative Assets</div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div className="field">
            <label className="field-label">Who&apos;s logging in?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {USERS.map(u => (
                <button key={u} className="btn" onClick={() => { setSelected(u); setPin(''); setError('') }}
                  style={selected === u ? { background: 'var(--accent)', color: '#0e0e10', borderColor: 'var(--accent)' } : {}}>
                  <span>{u}</span>
                  {(u === 'Anshu' || u === 'Amit') && <span className="badge badge-video" style={{ fontSize: '10px', padding: '1px 5px' }}>Video</span>}
                  {u === 'Ranjeet' && <span className="badge badge-graphic" style={{ fontSize: '10px', padding: '1px 5px' }}>Graphic</span>}
                  {u === 'PM' && <span className="badge badge-pm" style={{ fontSize: '10px', padding: '1px 5px' }}>PM</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">PIN</label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: pin.length > i ? 'var(--accent)' : 'var(--bg3)', border: '1px solid ' + (pin.length > i ? 'var(--accent)' : 'var(--border2)'), transition: 'background 0.15s' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {['1','2','3','4','5','6','7','8','9'].map(n => (
                <button key={n} className="btn" onClick={() => pressNum(n)}
                  style={{ justifyContent: 'center', fontSize: '18px', fontWeight: '500', padding: '12px', opacity: loading ? 0.5 : 1 }}>
                  {n}
                </button>
              ))}
              <div />
              <button className="btn" onClick={() => pressNum('0')} style={{ justifyContent: 'center', fontSize: '18px', fontWeight: '500', padding: '12px' }}>0</button>
              <button className="btn" onClick={pressBack} style={{ justifyContent: 'center', fontSize: '16px' }}>⌫</button>
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: 'var(--red)', textAlign: 'center', marginTop: '8px' }}>{error}</div>}
          {loading && <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', marginTop: '8px' }}>Signing in…</div>}
        </div>
      </div>
    </div>
  )
}
