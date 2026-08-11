import { ChevronDown, LogOut, Menu, Radio, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import xanhSmMark from '@/assets/xanh-sm-mark.svg'
import { IconButton } from '@/shared/components/ui/IconButton'
import { operatorNavigation } from '@/shared/config/navigation'

export function OperatorShell({ notifications, onSignOut, userEmail }: { notifications?: ReactNode; onSignOut?: () => void; userEmail?: string | null }) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isProfileOpen, setProfileOpen] = useState(false)

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-brand-200 bg-gradient-to-b from-brand-50 via-cyan-50 to-brand-100/70 shadow-[6px_0_24px_rgba(8,116,115,0.07)] lg:block">
        <Brand />
        <Navigation onNavigate={() => undefined} />
        <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/80 bg-white/70 p-3.5 text-ink shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-semibold"><Radio className="size-4 text-brand-500" />Hệ thống trực tuyến</div>
          <p className="mt-1.5 text-xs leading-5 text-muted">30 AI zone · Đồng bộ mỗi 2 phút</p>
        </div>
      </aside>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} role="presentation">
          <aside className="h-full w-72 border-r border-brand-200 bg-gradient-to-b from-brand-50 via-cyan-50 to-brand-100/70 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><Brand /><IconButton className="mr-3 text-ink hover:bg-cyan-50" label="Đóng điều hướng" onClick={() => setMobileMenuOpen(false)}><X /></IconButton></div>
            <Navigation onNavigate={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:pl-64">
        <header className="relative flex h-16 items-center justify-between border-b border-sky-100 bg-white/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <IconButton className="lg:hidden" label="Mở điều hướng" onClick={() => setMobileMenuOpen(true)}><Menu /></IconButton>
            <p className="hidden items-center gap-2 text-sm text-muted lg:flex"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-cyan-500" /></span>Trung tâm điều phối Hà Nội · Đang trực tuyến</p>
          </div>
          <div className="flex items-center gap-1">
            {notifications}
            <div className="relative">
              <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium hover:bg-brand-50" type="button" onClick={() => setProfileOpen((value) => !value)}>
                <span className="grid size-8 place-items-center rounded-xl bg-brand-500 text-xs font-bold text-white">OP</span>
                <span className="hidden sm:inline">Điều phối viên</span><ChevronDown size={16} />
              </button>
              {isProfileOpen && <div className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-sky-100 bg-white p-2 shadow-panel"><p className="truncate px-3 py-2 text-sm font-semibold text-ink">{userEmail ?? 'Điều phối viên'}</p><p className="px-3 pb-2 text-xs text-muted">Vai trò: Điều phối viên</p>{onSignOut && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={onSignOut} type="button"><LogOut className="size-4" />Đăng xuất</button>}</div>}
            </div>
          </div>
        </header>
        <main className="p-5 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}

function Brand() {
  return <div className="flex h-16 items-center gap-3 border-b border-brand-200/70 bg-white/35 px-5"><img alt="Xanh SM" className="size-10" src={xanhSmMark} /><div><p className="text-sm font-bold tracking-wide text-ink">XANH SM</p><p className="text-xs text-brand-700">GSM Control Center</p></div></div>
}

function Navigation({ onNavigate }: { onNavigate: () => void }) {
  return <nav className="space-y-1 p-3" aria-label="Điều hướng người vận hành">{operatorNavigation.map(({ icon: Icon, label, path }) => <NavLink key={path} to={path} end={path === '/operator'} onClick={onNavigate} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand-500 text-white shadow-sm shadow-cyan-700/20' : 'text-slate-600 hover:bg-white/70 hover:text-brand-700'}`}><Icon className="size-[18px] transition-transform group-hover:scale-105" aria-hidden="true" />{label}</NavLink>)}</nav>
}
