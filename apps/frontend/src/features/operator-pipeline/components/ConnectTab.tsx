import { useState, type ReactNode } from 'react'
import { Layers } from 'lucide-react'

import { AgentFlowCard } from '@/features/operator-pipeline/components/AgentFlowCard'
import { AgentTaskList } from '@/features/operator-pipeline/components/AgentTaskList'
import { FlowEdges, FlowStage, type FlowEdge } from '@/features/operator-pipeline/components/FlowGraph'
import { OptimizationDetail } from '@/features/operator-pipeline/components/OptimizationDetail'
import { OptimizationNode } from '@/features/operator-pipeline/components/OptimizationNode'
import { useFlowAnchors } from '@/features/operator-pipeline/hooks/useFlowAnchors'
import { buildAgentCards } from '@/features/operator-pipeline/model/agentCards'
import { outsideTasks, tasksForAgent, type AgentTask } from '@/features/operator-pipeline/model/agentTasks'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { moveLabel, readProposedMoves, type ProposedMove } from '@/features/operator-pipeline/model/proposedMoves'

// Tab Sơ đồ luồng (agent/07-Design §5): ba cột — thẻ agent nguồn, node Optimization ở giữa,
// panel chi tiết bên phải. Cạnh nối chạy giữa các cột, chấm sáng thể hiện dữ liệu đang chảy.

const sourceIds = ['forecast', 'traffic', 'supply', 'dispatch']
const detailAnchorId = 'detail'

export function ConnectTab({ run, focusedAgentId, onFocusAgent, onOpenPlan, tasks, decisionSlot }: {
  run: PipelineRunRecord | undefined
  focusedAgentId: string | undefined
  onFocusAgent: (agentId: string) => void
  onOpenPlan: (() => void) | undefined
  tasks: readonly AgentTask[]
  decisionSlot: ReactNode
}) {
  const [openId, setOpenId] = useState<string | undefined>()
  const { anchors, containerRef, registerNode, size } = useFlowAnchors()
  const cards = buildAgentCards(run)
  const sources = cards.filter((card) => sourceIds.includes(card.id))
  const target = cards.find((card) => card.id === 'optimization')
  const toolCalls = run?.tool_calls ?? []
  const moves = readProposedMoves(run?.decision)
  const plans = run?.plan_set?.plans ?? []
  const recommended = plans.find((plan) => plan.plan_id === run?.recommended_plan_id) ?? plans[0]

  if (!target) return null

  const edges: readonly FlowEdge[] = [
    ...sources.map((card): FlowEdge => ({
      id: `${card.id}-optimization`,
      from: card.id,
      to: target.id,
      isFlowing: card.status === 'RUNNING' || card.status === 'DONE',
    })),
    { id: 'optimization-detail', from: target.id, to: detailAnchorId, isFlowing: target.status === 'DONE' },
  ]

  return (
    <div className="space-y-4">
      <FlowStage containerRef={containerRef}>
        <FlowEdges anchors={anchors} edges={edges} size={size} />

        <ul className="nfp-flow-column space-y-2.5">
          {sources.map((card) => (
            <AgentFlowCard
              card={card}
              isFocused={card.id === focusedAgentId}
              isOpen={openId === card.id}
              key={card.id}
              nodeRef={registerNode(card.id)}
              onToggle={() => {
                onFocusAgent(card.id)
                setOpenId((current) => (current === card.id ? undefined : card.id))
              }}
              tasks={tasksForAgent(card.id, tasks, toolCalls)}
            >
              {card.id === 'dispatch' && moves.length > 0 && <ProposedMoveList moves={moves} />}
            </AgentFlowCard>
          ))}
        </ul>

        <div className="nfp-flow-center">
          <OptimizationNode
            card={target}
            isFocused={target.id === focusedAgentId}
            nodeRef={registerNode(target.id)}
            onSelect={() => onFocusAgent(target.id)}
            plan={recommended}
          />
        </div>

        <aside className="nfp-flow-detail" ref={registerNode(detailAnchorId)}>
          <OptimizationDetail decisionSlot={decisionSlot} onOpenPlan={onOpenPlan} run={run} />
        </aside>
      </FlowStage>

      <OutsideTasks tasks={outsideTasks(tasks)} />
    </div>
  )
}

// Không nhét các bước này vào agent nào: cổng người, Khối C và History Store nằm **ngoài**
// đồ thị theo CLAUDE.md §2, và vẽ chúng như việc của agent là mô tả sai trách nhiệm.
function OutsideTasks({ tasks }: { tasks: readonly AgentTask[] }) {
  const [isOpen, setOpen] = useState(false)
  if (tasks.length === 0) return null

  return (
    <section className="space-y-2">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)] hover:text-[var(--nfp-ink)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Layers className="size-3" />
        Ngoài đồ thị agent ({tasks.length})
        <span aria-hidden className="ml-auto">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <>
          <p className="text-[10px] leading-relaxed text-[var(--nfp-muted)]">
            Cổng phê duyệt, Khối C và History Store là code thuần, không nằm trong đồ thị agent
            và không agent nào được tự chạy chúng.
          </p>
          <AgentTaskList emptyNote="" tasks={tasks} />
        </>
      )}
    </section>
  )
}

function ProposedMoveList({ moves }: { moves: readonly ProposedMove[] }) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--nfp-line)] px-3 py-2">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">
        Chặng đề xuất ({moves.length}) · chỉ đọc
      </p>
      <ul className="space-y-1">
        {moves.map((move) => (
          <li className="flex items-baseline justify-between gap-2 text-[11px]" key={move.id}>
            <span className="text-[var(--nfp-ink)]">{moveLabel(move)}</span>
            <span className="flex-none text-[9px] text-[var(--nfp-muted)]">{move.etaSteps} step</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--nfp-muted)]">
        Sửa số xe hoặc bỏ chặng phải làm ở màn hình phương án (Revise), rồi đi qua cổng phê duyệt.
      </p>
    </div>
  )
}
