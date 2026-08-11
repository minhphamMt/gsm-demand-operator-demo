import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { FieldLabel, Input } from '@/shared/components/ui/Field'
import { routes } from '@/shared/config/routes'

export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  if (auth.status === 'authenticated') {
    return <Navigate replace to={auth.identity.role === 'OPERATOR' ? routes.operator.root : routes.driver.root} />
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      await auth.signIn(email.trim(), password)
    } catch {
      setError('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra và thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  const returnPath = typeof location.state === 'object' && location.state !== null && 'from' in location.state
    ? String(location.state.from)
    : null

  return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
    <Card className="w-full max-w-md border-slate-700 bg-white p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">GSM Control Center</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-950">Đăng nhập hệ thống</h1>
      <p className="mt-2 text-sm text-slate-600">Sử dụng tài khoản điều phối viên hoặc tài xế đã được cấp.</p>
      {returnPath && <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">Vui lòng đăng nhập để tiếp tục.</p>}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div><FieldLabel htmlFor="login-email">Email</FieldLabel><Input autoComplete="email" id="login-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div>
        <div><FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel><Input autoComplete="current-password" id="login-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></div>
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
        <Button className="w-full" isLoading={isSubmitting} type="submit">Đăng nhập</Button>
      </form>
    </Card>
  </main>
}
