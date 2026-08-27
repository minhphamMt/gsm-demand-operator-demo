import { Bot, CloudRain, Layers, MessageSquareText, Route, Share2, Sparkles, Truck } from 'lucide-react'
import type { ReactNode } from 'react'

import { AgentStatusMark } from '@/features/operator-pipeline/components/AgentStatusMark'
import { agentStatusColor, agentStatusLabel } from '@/features/operator-pipeline/model/agentStatus'
import { ToolCallTrail } from '@/features/operator-pipeline/components/ToolCallTrail'
import { buildAgentCards, type AgentCard } from '@/features/operator-pipeline/model/agentCards'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'

// Tab Agents (agent/07-Design §4): lưới thẻ 2 cột, bấm một thẻ để mở sơ đồ và focus đúng node.

const agentIcon: Record<string, ReactNode> = {
  forecast: <Bot className="size-3.5" />,
  traffic: <CloudRain className="size-3.5" />,
  supply: <Truck className="size-3.5" />,
  situation_assessment: <Layers className="size-3.5" />,
  dispatch: <Route className="size-3.5" />,
  optimization: <Sparkles className="size-3.5" />,
  explanation: <MessageSquareText className="size-3.5" />,
}

export function PipelinePanel({ run, focusedAgentId, onFocusAgent, modeBanner }: {
  run: PipelineRunRecord | undefined
  focusedAgentId?: string | undefined
  onFocusAgent?: ((agentId: string) => void) | undefined
  modeBanner?: ReactNode
}) {
  const cards = buildAgentCards(run)
  const toolCalls = run?.tool_calls ?? []

  return (
    <div className="space-y-3">
      {modeBanner}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">
          Agent của lượt phân tích
        </h3>
        {run?.routing_mode && (
          <span className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            run.routing_mode === 'llm'
              ? 'bg-violet-100 text-violet-700'
              : 'bg-[var(--nfp-raise-2)] text-[var(--nfp-muted)]'
          }`}>
            {run.routing_mode === 'llm' ? 'LLM tự chọn tool' : 'Đường cố định'}
          </span>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <AgentCardTile
            card={card}
            isFocused={card.id === focusedAgentId}
            key={card.id}
            {...(onFocusAgent ? { onFocus: () => onFocusAgent(card.id) } : {})}
          />
        ))}
      </ul>

      {toolCalls.length > 0 && <ToolCallTrail toolCalls={toolCalls} />}
    </div>
  )
}

function AgentCardTile({ card, isFocused, onFocus }: { card: AgentCard; isFocused: boolean; onFocus?: () => void }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className={agentStatusColor(card.status)}>{agentIcon[card.id]}</span>
        <span className="truncate text-xs font-bold text-[var(--nfp-ink)]">{card.label}</span>
        <span className="ml-auto flex items-center gap-1">
          {card.durationSeconds !== null && (
            <span className="text-[9px] tabular-nums text-[var(--nfp-muted)]">{card.durationSeconds.toFixed(1)}s</span>
          )}
          <AgentStatusMark status={card.status} />
          <span className="sr-only">{agentStatusLabel(card.status)}</span>
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[var(--nfp-muted)]">
        {card.message || card.role}
      </p>
      {card.metrics.length > 0 && (
        <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[var(--nfp-line)] pt-1.5">
          {card.metrics.map((metric) => (
            <div className="flex items-baseline gap-1" key={metric.label}>
              <dt className="text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{metric.label}</dt>
              <dd className="text-[11px] font-bold text-[var(--nfp-ink)]">{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )

  const isRunning = card.status === 'RUNNING'
  const className = `nfp-card h-full px-2.5 py-2 text-left ${isFocused ? 'is-active' : ''} ${isRunning ? 'nfp-scan' : ''}`

  return (
    <li>
      {onFocus ? (
        <button aria-label={`Xem ${card.label} trong sơ đồ`} className={`${className} block w-full`} onClick={onFocus} type="button">
          {body}
          <span className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold text-[var(--nfp-accent)]">
            <Share2 className="size-2.5" />Xem trong sơ đồ
          </span>
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}
