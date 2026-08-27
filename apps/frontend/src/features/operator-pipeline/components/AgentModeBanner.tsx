import { Bot, CircuitBoard, TriangleAlert } from 'lucide-react'

import { agentModeDetail, agentModeLabel, agentModeReadiness, type LlmHealth, type LlmModelHealth } from '@/features/operator-pipeline/model/llmHealth'

// Cho biết **lượt chạy tới** sẽ đi đường nào: LLM tự chọn tool hay chuỗi tool cố định.
//
// Khác với badge `routing_mode` trên thẻ agent — badge đó là sự thật của một run đã chạy.
// Hai thứ có thể lệch nhau (đổi cấu hình giữa hai lượt), và gộp chúng lại sẽ nói dối về
// một trong hai.

export function AgentModeBanner({ health, isLoading, onRetry }: {
  health: LlmHealth | undefined
  isLoading: boolean
  onRetry: () => void
}) {
  const readiness = agentModeReadiness(health)

  if (isLoading || !readiness || !health) {
    return (
      <p className="nfp-card px-3 py-2 text-[10px] text-[var(--nfp-muted)]" role="status">
        {isLoading ? 'Đang kiểm tra cấu hình gateway…' : (
          <>
            Chưa đọc được cấu hình gateway.{' '}
            <button className="font-bold text-[var(--nfp-accent)]" onClick={onRetry} type="button">Thử lại</button>
          </>
        )}
      </p>
    )
  }

  const isLlm = readiness === 'llm'
  const isProblem = readiness === 'llm_degraded' || readiness === 'deterministic_no_key'

  return (
    <section aria-label="Chế độ agent" className="nfp-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={isLlm ? 'text-[var(--nfp-accent)]' : isProblem ? 'text-[var(--nfp-warn)]' : 'text-[var(--nfp-muted)]'}>
          {isLlm ? <Bot className="size-4" /> : isProblem ? <TriangleAlert className="size-4" /> : <CircuitBoard className="size-4" />}
        </span>
        <b className="text-[11px] font-bold text-[var(--nfp-ink)]">{agentModeLabel[readiness]}</b>
        <span className="ml-auto truncate text-[9px] text-[var(--nfp-muted)]" title={health.baseUrl}>{health.baseUrl}</span>
      </div>

      <p className="mt-1 text-[10px] leading-relaxed text-[var(--nfp-muted)]">{agentModeDetail[readiness]}</p>

      <dl className="mt-2 space-y-1 border-t border-[var(--nfp-line)] pt-2">
        <ModelRow health={health.analysis} label="Phân tích" />
        <ModelRow health={health.explanation} label="Diễn giải" />
      </dl>
    </section>
  )
}

function ModelRow({ label, health }: { label: string; health: LlmModelHealth }) {
  return (
    <div className="flex items-baseline gap-2 text-[10px]">
      <dt className="w-14 flex-none uppercase tracking-wider text-[var(--nfp-muted)]">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={`size-1.5 flex-none rounded-full ${health.ok ? 'bg-[var(--nfp-ok)]' : 'bg-[var(--nfp-idle)]'}`} />
        <span className="truncate font-mono text-[var(--nfp-ink)]" title={health.model}>{health.model || '—'}</span>
        {health.error && <span className="truncate text-[var(--nfp-warn)]" title={health.error}>· {health.error}</span>}
        {health.ok && health.servedBy && health.servedBy !== health.model && (
          <span className="truncate text-[var(--nfp-muted)]" title={health.servedBy}>· phục vụ bởi {health.servedBy}</span>
        )}
      </dd>
    </div>
  )
}
