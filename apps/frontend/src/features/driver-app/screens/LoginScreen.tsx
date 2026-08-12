import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../state/AuthProvider'

const inputStyle = {
  width: '100%',
  height: 48,
  padding: '0 14px',
  boxSizing: 'border-box',
  border: '1.4px solid #dfe3e4',
  borderRadius: 12,
  font: "500 15px/1 'Be Vietnam Pro',sans-serif",
  color: '#1b2225',
  background: '#fff',
  outline: 'none',
} as const

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await signIn(email.trim(), password)
    if (signInError) {
      setError(signInError === 'Invalid login credentials' ? 'Email hoặc mật khẩu không đúng.' : signInError)
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 70,
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px 32px',
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-18%',
          right: '-18%',
          bottom: '-22%',
          height: '48%',
          borderRadius: '50% 50% 0 0',
          background: 'radial-gradient(circle at 50% 18%, rgba(18,184,198,.18), rgba(18,184,198,0) 62%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ width: '100%', maxWidth: 334, position: 'relative' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: '#12b8c6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            font: "800 22px/1 'Be Vietnam Pro',sans-serif",
            color: '#fff',
          }}
        >
          G
        </div>
        <div style={{ font: "800 25px/1.25 'Be Vietnam Pro',sans-serif", color: '#1b2225', letterSpacing: '-0.02em' }}>
          GreenSM Driver
        </div>
        <div style={{ font: "400 13.5px/1.55 'Be Vietnam Pro',sans-serif", color: '#8b9296', marginTop: 7, maxWidth: 310 }}>
          Đăng nhập để nhận chương trình thưởng nóng theo khu vực.
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="username" required style={inputStyle} />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="current-password" required style={inputStyle} />

          {error && (
            <div role="alert" style={{ background: '#fdeced', border: '1px solid #f6c9c5', borderRadius: 10, padding: '10px 12px', font: "500 13px/1.45 'Be Vietnam Pro',sans-serif", color: '#c1362b' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              height: 56,
              marginTop: 6,
              border: 0,
              borderRadius: 28,
              background: busy ? '#8ed9e0' : '#12b8c6',
              font: "700 16px/1 'Be Vietnam Pro',sans-serif",
              color: '#fff',
              cursor: busy ? 'default' : 'pointer',
              boxShadow: '0 8px 20px rgba(18,184,198,.3)',
            }}
          >
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
