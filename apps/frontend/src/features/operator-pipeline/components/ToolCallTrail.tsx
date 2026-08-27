import type { PipelineToolCall } from '@/features/operator-pipeline/model/pipelineRun'

// Nhật ký tool: bằng chứng agent đã gọi đúng chuỗi tool nào, theo thứ tự nào.

export function ToolCallTrail({ toolCalls }: { toolCalls: readonly PipelineToolCall[] }) {
  return (
    <details className="nfp-card px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">
        Nhật ký tool ({toolCalls.length})
      </summary>
      <ul className="mt-2 space-y-1">
        {toolCalls.map((call, index) => (
          <li className="flex items-center gap-2 font-mono text-[10px] text-[var(--nfp-muted)]" key={`${call.agent}-${call.tool}-${index}`}>
            <span className={`size-1.5 flex-none rounded-full ${call.ok ? 'bg-[var(--nfp-ok)]' : 'bg-[var(--nfp-crit)]'}`} />
            <span className="text-[var(--nfp-ink)]">{call.agent}</span>
            <span aria-hidden>→</span>
            <span>{call.tool}</span>
            {call.detail && <span className="truncate opacity-70">· {call.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
