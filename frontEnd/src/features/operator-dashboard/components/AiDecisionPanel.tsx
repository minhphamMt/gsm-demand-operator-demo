import { ArrowRight, Bot, CircleAlert, LoaderCircle, RefreshCw, Route, Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import type { Proposal } from '@/features/operator-data'
import { getAiZoneLabel } from '@/features/operator-data/model/aiZoneCatalog'
import { routes } from '@/shared/config/routes'
import { formatCurrency } from '@/shared/lib/format'

type Props = { isLoading: boolean; generationError?: string | undefined; isGenerating: boolean; onGenerate: () => void; plan?: Proposal | undefined }
const stages = ['Quan sát', 'Dự báo', 'Đề xuất', 'Phê duyệt'] as const

export function AiDecisionPanel({ generationError, isGenerating, isLoading, onGenerate, plan }: Props) {
  const moved = plan?.moves.reduce((sum, move) => sum + move.quantity, 0) ?? 0
  const reduced = plan ? Math.max(0, plan.metricsBefore.residualGap - plan.metrics.residualGap) : 0
  return <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#111719] text-white shadow-xl">
    <header className="border-b border-white/10 px-4 py-4"><div className="flex items-start justify-between gap-2"><div><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-teal-300"><Sparkles className="size-3.5" />AI decision engine</p><h2 className="mt-1 text-xl font-black">Đề xuất điều phối</h2></div><button className="flex min-h-8 items-center gap-1 rounded border border-teal-400/30 px-2 text-[10px] font-bold text-teal-300 disabled:opacity-50" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}{isGenerating ? 'Đang chạy' : 'Chạy AI'}</button></div>
      <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Tiến trình quyết định AI">{stages.map((stage, index) => <li key={stage}><span className={`block h-1 rounded ${index < 3 ? 'bg-teal-400' : 'bg-white/15'}`} /><span className={`mt-1 block truncate text-[9px] ${index === 2 ? 'font-bold text-white' : 'text-slate-500'}`}>{stage}</span></li>)}</ol>
    </header>
    {isLoading ? <div className="m-4 h-60 animate-pulse rounded bg-white/5" /> : plan ? <div className="flex min-h-0 flex-1 flex-col">
      <section className="border-b border-white/10 p-4"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-400 text-slate-950"><Bot className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-500">Phương án #{plan.rank}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold">Ưu tiên giảm thời gian chờ</h3></div></div></section>
      <dl className="grid grid-cols-3 border-b border-white/10"><Metric label="Điều xe" value={`${moved}`} /><Metric label="Giảm thiếu" value={`${reduced}`} /><Metric label="ETA" value={`${plan.averageEtaMinutes}′`} /></dl>
      <div className="min-h-0 flex-1 overflow-y-auto p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Lệnh điều chuyển</p><div className="mt-2 space-y-2">{plan.moves.slice(0, 2).map((move) => <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs" key={move.id}><span className="min-w-0 truncate text-slate-300"><Route className="mr-1 inline size-3 text-teal-300" />{getAiZoneLabel(move.sourceZoneId)} → {getAiZoneLabel(move.targetZoneId)}</span><b className="ml-2 shrink-0">{move.quantity} xe</b></div>)}</div><p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-400">AI ưu tiên vùng thiếu theo dự báo 15 phút, ETA và giới hạn ngân sách.</p></div>
      <footer className="border-t border-white/10 p-4">{generationError && <p className="mb-2 rounded bg-rose-400/10 p-2 text-xs text-rose-200" role="alert">{generationError}</p>}<div className="mb-3 flex justify-between text-xs"><span className="text-slate-400">Ngân sách tối đa</span><b>{formatCurrency(plan.estimatedRewardCost)}</b></div><Link className="flex min-h-11 items-center justify-between rounded-lg bg-teal-400 px-4 text-sm font-black text-slate-950 hover:bg-teal-300" to={routes.operator.planDetail(plan.id)}>Xem xét & phê duyệt<ArrowRight className="size-4" /></Link></footer>
    </div> : <div className="grid flex-1 place-items-center p-5 text-center"><div><CircleAlert className="mx-auto size-8 text-amber-300" /><h3 className="mt-3 font-bold">Chưa có đề xuất AI</h3><p className="mt-1 text-xs text-slate-400">Cần đủ 30/30 zone live để phân tích.</p>{generationError && <p className="mt-3 rounded bg-rose-400/10 p-2 text-xs text-rose-200" role="alert">{generationError}</p>}<button className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-50" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{isGenerating ? 'Đang phân tích' : 'Chạy AI'}</button></div></div>}
  </aside>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border-r border-white/10 px-2 py-3 text-center last:border-0"><dd className="text-lg font-black">{value}</dd><dt className="text-[9px] uppercase text-slate-500">{label}</dt></div> }
