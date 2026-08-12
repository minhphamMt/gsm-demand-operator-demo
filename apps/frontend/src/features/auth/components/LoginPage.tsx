import { LockKeyhole, Radio } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'

import xanhSmMark from '@/assets/xanh-sm-mark.svg'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/shared/components/ui/Button'
import { FieldLabel, Input } from '@/shared/components/ui/Field'
import { routes } from '@/shared/config/routes'

export function LoginPage() {
  const auth = useAuth(); const location = useLocation()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [isSubmitting, setSubmitting] = useState(false); const [error, setError] = useState<string>()
  if (auth.status === 'authenticated') return <Navigate replace to={auth.identity.role === 'OPERATOR' ? routes.operator.root : routes.driver.root} />

  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); setError(undefined); try { await auth.signIn(email.trim(), password) } catch { setError('Email hoặc mật khẩu không đúng.') } finally { setSubmitting(false) } }
  const returnPath = typeof location.state === 'object' && location.state !== null && 'from' in location.state

  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#e8eeee] px-4 py-10">
    <div className="absolute inset-0 opacity-50" aria-hidden="true"><div className="absolute left-[8%] top-[12%] size-72 rounded-full border border-teal-700/20 bg-teal-300/20" /><div className="absolute bottom-[8%] right-[12%] size-96 rounded-full border border-rose-700/15 bg-rose-200/25" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-400/40" /></div>
    <section className="relative w-full max-w-sm rounded-xl border border-slate-300 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,.16)]">
      <div className="flex items-center gap-3"><img alt="NovaFour" className="size-10" src={xanhSmMark} /><div><p className="font-black tracking-tight">NOVAFOUR OPS</p><p className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">AI fleet control</p></div></div>
      <div className="mt-7"><span className="grid size-9 place-items-center rounded-lg bg-slate-950 text-teal-300"><LockKeyhole className="size-4" /></span><h1 className="mt-3 text-2xl font-black">Đăng nhập</h1><p className="mt-1 text-xs text-slate-500">Truy cập trung tâm điều hành Hà Nội.</p></div>
      {returnPath && <p className="mt-3 rounded bg-sky-50 p-2 text-xs text-sky-800">Phiên làm việc cần được xác thực.</p>}
      <form className="mt-6 space-y-4" onSubmit={submit}><div><FieldLabel htmlFor="login-email">Email</FieldLabel><Input autoComplete="email" id="login-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div><div><FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel><Input autoComplete="current-password" id="login-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></div>{error && <p className="rounded bg-rose-50 p-2 text-xs text-rose-700" role="alert">{error}</p>}<Button className="w-full" isLoading={isSubmitting} type="submit">Đăng nhập hệ thống</Button></form>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-500"><Radio className="size-3 text-emerald-600" />Kết nối bảo mật · Human-in-the-loop</p>
    </section>
  </main>
}
