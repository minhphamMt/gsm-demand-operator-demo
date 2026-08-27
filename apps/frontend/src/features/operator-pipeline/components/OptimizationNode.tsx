import { AgentStatusMark } from '@/features/operator-pipeline/components/AgentStatusMark'
import { agentStatusLabel } from '@/features/operator-pipeline/model/agentStatus'
import type { AgentCard } from '@/features/operator-pipeline/model/agentCards'
import type { PipelinePlan } from '@/features/operator-pipeline/model/pipelineRun'

// Node trung tâm của sơ đồ (agent/07-Design §5.3): điểm gộp của bốn agent nguồn, hiển thị
// thu gọn bằng mini bar chart và vài chỉ số ngắn. Bấm vào để mở chi tiết ở panel bên phải.

export function OptimizationNode({ card, plan, isFocused, onSelect, nodeRef }: {
  card: AgentCard
  plan: PipelinePlan | undefined
  isFocused: boolean
  onSelect: () => void
  nodeRef: (node: HTMLElement | null) => void
}) {
  const bars = plan
    ? [plan.total_units, plan.move_count, plan.total_eta_step_units, Math.max(1, plan.residual_zone_count)]
    : []
  const max = Math.max(...bars, 1)

  return (
    <div ref={nodeRef}>
      <button
        aria-label={`${card.label} — ${agentStatusLabel(card.status)}`}
        className={`nfp-card w-full px-3 py-3 text-left ${isFocused ? 'is-active' : ''}`}
        onClick={onSelect}
        type="button"
      >
        <span className="flex items-center gap-2">
          <AgentStatusMark status={card.status} />
          <b className="text-[12px] font-bold text-[var(--nfp-ink)]">{card.label}</b>
        </span>

        {bars.length > 0 && (
          <span aria-hidden className="mt-2.5 flex h-10 items-end gap-1">
            {bars.map((value, index) => (
              <span
                className="flex-1 rounded-sm bg-[var(--nfp-accent)]"
                key={index}
                style={{ height: `${Math.max(12, (value / max) * 100)}%`, opacity: 0.45 + index * 0.15 }}
              />
            ))}
          </span>
        )}

        <dl className="mt-2.5 space-y-1 border-t border-[var(--nfp-line)] pt-2">
          {card.metrics.length > 0
            ? card.metrics.map((metric) => (
                <div className="flex items-baseline justify-between gap-2" key={metric.label}>
                  <dt className="text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{metric.label}</dt>
                  <dd className="text-[11px] font-bold text-[var(--nfp-ink)]">{metric.value}</dd>
                </div>
              ))
            : <p className="text-[10px] text-[var(--nfp-muted)]">Chờ output của bốn agent nguồn.</p>}
        </dl>
      </button>
    </div>
  )
}
