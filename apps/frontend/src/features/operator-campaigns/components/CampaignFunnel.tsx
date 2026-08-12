import type { Campaign } from '@/features/operator-data'

export function CampaignFunnel({ campaign }: { campaign: Campaign }) {
  const stages = [
    { label: 'Đủ điều kiện', value: campaign.candidateCount },
    { label: 'Đã gửi', value: campaign.offersSent },
    { label: 'Đã xem', value: campaign.viewed },
    { label: 'Chấp nhận', value: campaign.accepted },
    { label: 'Đang đến', value: campaign.enRoute },
    { label: 'GPS xác minh', value: campaign.arrivedVerified },
  ]
  const overall = campaign.candidateCount ? Math.round((campaign.arrivedVerified / campaign.candidateCount) * 100) : 0
  const maxValue = Math.max(...stages.map((stage) => stage.value), 1)
  const barClasses = ['bg-brand-100', 'bg-brand-200', 'bg-brand-300', 'bg-brand-400', 'bg-brand-500', 'bg-accent-500'] as const

  return (
    <div>
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Funnel tài xế</p><p className="mt-1 text-sm text-slate-500">Từ tập ứng viên đến khi GPS xác minh vào vùng đích.</p></div><p className="text-sm font-semibold text-slate-900">Chuyển đổi tổng: {overall}%</p></div>
      <ol className="mt-4 grid h-56 grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 pb-4 pt-5 sm:grid-cols-6">
        {stages.map((stage, index) => {
          const previous = index ? (stages[index - 1]?.value ?? 0) : stage.value
          const dropOff = previous ? Math.max(0, Math.round((1 - stage.value / previous) * 100)) : 0
          return (
            <li className="flex min-w-0 flex-col justify-end text-center" key={stage.label}>
              <p className="text-sm font-semibold tabular-nums text-slate-950">{stage.value}</p>
              <p className={`mt-0.5 text-[10px] ${index === 0 ? 'text-slate-400' : dropOff >= 20 ? 'text-rose-600' : 'text-slate-500'}`}>{index === 0 ? 'Đầu vào' : `-${dropOff}%`}</p>
              <div className={`mx-auto mt-2 w-full max-w-20 rounded-t-md ${barClasses[index]}`} style={{ height: `${Math.max(18, Math.round((stage.value / maxValue) * 112))}px` }} />
              <p className="mt-2 truncate text-[11px] font-medium text-slate-600" title={stage.label}>{stage.label}</p>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Tỷ lệ chuyển đổi tổng thể: <strong className="text-slate-900">{overall}%</strong></span><span>Drop-off lớn nhất được tô đỏ để điều phối viên theo dõi.</span></div>
    </div>
  )
}
