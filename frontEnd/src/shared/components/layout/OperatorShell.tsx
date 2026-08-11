import { ChevronDown, LogOut, Menu, Radio, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import xanhSmMark from '@/assets/xanh-sm-mark.svg'
import { IconButton } from '@/shared/components/ui/IconButton'
import { operatorNavigation } from '@/shared/config/navigation'

export function OperatorShell({ notifications, onSignOut, userEmail }: { notifications?: ReactNode; onSignOut?: () => void; userEmail?: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  return <div className="min-h-screen bg-[#f4f5f5] text-ink lg:h-screen lg:overflow-hidden">
    <header className="relative z-30 flex h-14 items-center border-b border-slate-300 bg-white px-3 lg:px-5">
      <IconButton className="mr-2 lg:hidden" label="Mở điều hướng" onClick={() => setMenuOpen(true)}><Menu /></IconButton>
      <Brand />
      <nav className="ml-8 hidden h-full items-stretch lg:flex" aria-label="Điều hướng người vận hành">
        {operatorNavigation.map(({ label, path }) => <NavLink key={path} to={path} end={path === '/operator'} className={({ isActive }) => `flex items-center border-x border-transparent px-5 text-sm font-bold transition ${isActive ? 'border-slate-300 bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</NavLink>)}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs font-semibold text-emerald-700 md:flex"><Radio className="size-3.5" />Trực tuyến</span>
        {notifications}
        <div className="relative">
          <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => setProfileOpen((value) => !value)} type="button"><span className="grid size-8 place-items-center rounded-lg bg-teal-500 text-xs font-black text-white">OP</span><span className="hidden text-sm font-semibold sm:inline">Điều phối viên</span><ChevronDown className="size-4" /></button>
          {profileOpen && <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-sm font-semibold">{userEmail ?? 'Điều phối viên'}</p>{onSignOut && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50" onClick={onSignOut} type="button"><LogOut className="size-4" />Đăng xuất</button>}</div>}
        </div>
      </div>
    </header>
    {menuOpen && <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" onClick={() => setMenuOpen(false)} role="presentation"><aside className="h-full w-72 bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><Brand /><IconButton label="Đóng điều hướng" onClick={() => setMenuOpen(false)}><X /></IconButton></div><nav className="mt-4 space-y-1">{operatorNavigation.map(({ icon: Icon, label, path }) => <NavLink key={path} to={path} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${isActive ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100'}`}><Icon className="size-4" />{label}</NavLink>)}</nav></aside></div>}
    <main className="p-3 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden"><Outlet /></main>
  </div>
}

function Brand() {
  return <div className="flex shrink-0 items-center gap-2"><img alt="Xanh SM" className="size-8" src={xanhSmMark} /><div><p className="text-sm font-black tracking-tight">NOVAFOUR OPS</p><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">AI fleet control</p></div></div>
}
