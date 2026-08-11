import { ArrowRight, Bot, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Route, Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import type { Proposal } from '@/features/operator-data'
import { routes } from '@/shared/config/routes'
import { formatCurrency } from '@/shared/lib/format'

type AiDecisionPanelProps = {
  isLoading: boolean
  generationError?: string | undefined
  isGenerating: boolean
  onGenerate: () => void
  plan?: Proposal | undefined
}

const stages = ['Quan sát', 'Dự báo', 'Đề xuất', 'Phê duyệt'] as const

export function AiDecisionPanel({ generationError, isGenerating, isLoading, onGenerate, plan }: AiDecisionPanelProps) {
  const movedUnits = plan?.moves.reduce((sum, move) => sum + move.quantity, 0) ?? 0
  const gapReduction = plan ? Math.max(0, plan.metricsBefore.residualGap - plan.metrics.residualGap) : 0

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-panel border border-slate-800 bg-slate-950 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.22),transparent_45%)] px-4 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300"><Sparkles className="size-3.5" />AI decision engine</p><h2 className="mt-2 text-xl font-bold">Đề xuất điều phối</h2></div>
          <button className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}{isGenerating ? 'Đang chạy' : 'Chạy AI'}</button>
        </div>
        <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="Tiến trình quyết định AI">
          {stages.map((stage, index) => <li className="min-w-0" key={stage}><span className={`block h-1 rounded-full ${index < 3 ? 'bg-teal-400' : 'bg-white/15'}`} /><span className={`mt-1.5 block truncate text-[9px] font-semibold ${index === 2 ? 'text-white' : 'text-slate-500'}`}>{stage}</span></li>)}
        </ol>
      </div>

      {isLoading ? <div className="m-4 h-60 animate-pulse rounded-xl bg-white/5" /> : plan ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-400 text-slate-950"><Bot className="size-5" /></span>
              <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phương án xếp hạng #{plan.rank}</p><h3 className="mt-1 text-base font-bold leading-snug">{plan.title}</h3><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-400"><span className="rounded bg-white/5 px-1.5 py-1">{plan.generatorVersion}</span><span className="rounded bg-white/5 px-1.5 py-1">{plan.forecastMode === 'live_snapshot_baseline' ? 'Baseline live' : plan.forecastMode ?? 'Chưa rõ chế độ'}</span><span className="rounded bg-white/5 px-1.5 py-1">Snapshot DB</span></div></div>
            </div>
          </div>

          <dl className="grid grid-cols-3 border-b border-white/10"><Metric label="Điều xe" value={movedUnits} suffix=" xe" /><Metric label="Giảm thiếu" value={gapReduction} suffix=" xe" /><Metric label="ETA" value={plan.averageEtaMinutes} suffix=" phút" /></dl>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">AI giải thích</p><p className="mt-2 text-sm leading-6 text-slate-300">{plan.explanation[0] ?? `AI phát hiện thiếu cung tại ${plan.targetZoneLabel} và tối ưu nguồn xe theo khoảng cách, ETA và ngân sách.`}</p></section>
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-300"><Route className="size-4" />Lệnh điều chuyển</div>
              <div className="mt-2 space-y-2">{plan.moves.slice(0, 3).map((move) => <div className="flex items-center justify-between gap-3 text-xs" key={move.id}><span className="min-w-0 truncate text-slate-300">{move.sourceZoneLabel} → {move.targetZoneLabel}</span><strong className="shrink-0 text-white">{move.quantity} xe</strong></div>)}{!plan.moves.length && <p className="text-xs text-slate-500">Không có lệnh điều chuyển khả dụng.</p>}</div>
            </section>
            <div className="flex items-start gap-2 text-xs text-slate-400"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /><p>Đã kiểm tra chính sách. Người điều phối vẫn là người phê duyệt cuối cùng.</p></div>
          </div>

          <div className="border-t border-white/10 p-4">
            {generationError && <p className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/10 p-2 text-xs leading-5 text-rose-200" role="alert">{generationError}</p>}
            <div className="mb-3 flex items-center justify-between text-xs"><span className="text-slate-400">Ngân sách dự kiến</span><strong>{formatCurrency(plan.estimatedRewardCost)}</strong></div>
            <Link className="flex min-h-11 items-center justify-between rounded-xl bg-teal-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-teal-300" to={routes.operator.planDetail(plan.id)}><span>Xem xét & quyết định</span><ArrowRight className="size-4" /></Link>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-center"><div><CircleAlert className="mx-auto size-8 text-amber-300" /><h3 className="mt-3 font-bold">Chưa có đề xuất AI</h3><p className="mt-2 text-sm leading-6 text-slate-400">Chạy AI trên snapshot Supabase mới nhất để tạo proposal.</p>{generationError && <p className="mt-3 rounded-lg bg-rose-400/10 p-2 text-xs leading-5 text-rose-200" role="alert">{generationError}</p>}<button className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-50" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{isGenerating ? 'Đang phân tích…' : 'Chạy AI với dữ liệu live'}</button></div></div>
      )}
    </aside>
  )
}

function Metric({ label, suffix, value }: { label: string; suffix: string; value: number }) {
  return <div className="border-r border-white/10 px-2 py-3 text-center last:border-r-0"><dd className="text-lg font-bold">{value}<span className="text-[10px] font-medium text-slate-500">{suffix}</span></dd><dt className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{label}</dt></div>
}
