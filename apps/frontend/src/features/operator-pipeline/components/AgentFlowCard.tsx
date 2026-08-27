import { Bot, ChevronDown, CloudRain, MessageSquareText, Route, Sparkles, Truck } from 'lucide-react'
import type { ReactNode } from 'react'

import { AgentStatusMark } from '@/features/operator-pipeline/components/AgentStatusMark'
import { AgentTaskList } from '@/features/operator-pipeline/components/AgentTaskList'
import { agentStatusColor, agentStatusLabel } from '@/features/operator-pipeline/model/agentStatus'
import type { AgentCard } from '@/features/operator-pipeline/model/agentCards'
import type { AgentTask } from '@/features/operator-pipeline/model/agentTasks'

// Thẻ agent ở cột trái của sơ đồ (agent/07-Design §5.1): icon vai trò, tên, mô tả ngắn,
// các chỉ số kết quả, và bung ra được thành danh sách task/tool ngay trong thẻ.

const agentIcon: Record<string, ReactNode> = {
  forecast: <Bot className="size-4" />,
  traffic: <CloudRain className="size-4" />,
  supply: <Truck className="size-4" />,
  dispatch: <Route className="size-4" />,
  optimization: <Sparkles className="size-4" />,
  explanation: <MessageSquareText className="size-4" />,
}

export function AgentFlowCard({ card, tasks, isOpen, isFocused, onToggle, nodeRef, children }: {
  card: AgentCard
  tasks: readonly AgentTask[]
  isOpen: boolean
  isFocused: boolean
  onToggle: () => void
  nodeRef: (node: HTMLElement | null) => void
  children?: ReactNode
}) {
  return (
    <li className={`nfp-card ${isFocused ? 'is-active' : ''} ${card.status === 'RUNNING' ? 'nfp-scan' : ''}`} ref={nodeRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`${card.label} — ${agentStatusLabel(card.status)}`}
        className="flex w-full items-start gap-3 px-3 py-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className={`grid size-9 flex-none place-items-center rounded-lg bg-[var(--nfp-accent-soft)] ${agentStatusColor(card.status)}`}>
          {agentIcon[card.id]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b className="truncate text-[13px] font-bold text-[var(--nfp-ink)]">{card.label}</b>
            <AgentStatusMark status={card.status} />
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--nfp-muted)]">
              {agentStatusLabel(card.status)}
            </span>
            {card.durationSeconds !== null && (
              <span className="text-[9px] tabular-nums text-[var(--nfp-muted)]" title="Thời lượng chạy của agent">
                {card.durationSeconds.toFixed(1)}s
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--nfp-muted)]">
            {card.message || card.role}
          </span>
        </span>

        {card.metrics.length > 0 && (
          <span className="flex flex-none gap-4 border-l border-[var(--nfp-line)] pl-3">
            {card.metrics.map((metric) => (
              <span className="block" key={metric.label}>
                <span className="block text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{metric.label}</span>
                <b className="block text-[13px] font-bold text-[var(--nfp-accent)]">{metric.value}</b>
              </span>
            ))}
          </span>
        )}

        <ChevronDown
          aria-hidden
          className={`mt-1 size-4 flex-none text-[var(--nfp-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-[var(--nfp-line)] p-3">
          <AgentTaskList
            emptyNote={`Lượt chạy này chưa có task hay tool nào thuộc ${card.label}.`}
            tasks={tasks}
          />
          {children}
        </div>
      )}
    </li>
  )
}
