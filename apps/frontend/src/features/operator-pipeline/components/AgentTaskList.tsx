import { Check, Circle, Minus, Pause, Play, TriangleAlert } from 'lucide-react'

import type { AgentTask, AgentTaskState } from '@/features/operator-pipeline/model/agentTasks'

// Danh sách task/tool của một agent, hiển thị "thòi ra" dưới node khi bấm vào node đó.
// Cùng ngôn ngữ trạng thái với TIẾN TRÌNH HỆ THỐNG cũ để người vận hành không phải học lại.

const stateLabel: Record<AgentTaskState, string> = {
  done: 'XONG',
  running: 'ĐANG CHẠY',
  waiting: 'CHỜ BẠN',
  queued: 'ĐANG CHỜ',
  attention: 'CẦN KIỂM TRA',
  stale: 'DỮ LIỆU CŨ',
  skipped: 'BỎ QUA',
  idle: 'CHỜ ĐIỀU KIỆN',
}

const stateTone: Record<AgentTaskState, string> = {
  done: 'text-[var(--nfp-ok)]',
  running: 'text-[var(--nfp-accent)]',
  waiting: 'text-[var(--nfp-warn)]',
  queued: 'text-[var(--nfp-warn)]',
  attention: 'text-[var(--nfp-crit)]',
  stale: 'text-[var(--nfp-crit)]',
  skipped: 'text-[var(--nfp-idle)]',
  idle: 'text-[var(--nfp-idle)]',
}

function StateIcon({ state }: { state: AgentTaskState }) {
  const className = `size-3 ${stateTone[state]}`
  if (state === 'done') return <Check aria-hidden className={className} />
  if (state === 'running') return <Play aria-hidden className={className} />
  if (state === 'waiting' || state === 'queued') return <Pause aria-hidden className={className} />
  if (state === 'attention' || state === 'stale') return <TriangleAlert aria-hidden className={className} />
  if (state === 'skipped') return <Minus aria-hidden className={className} />
  return <Circle aria-hidden className={className} />
}

export function AgentTaskList({ tasks, emptyNote }: { tasks: readonly AgentTask[]; emptyNote: string }) {
  if (tasks.length === 0) {
    return <p className="nfp-card px-3 py-2 text-[10px] text-[var(--nfp-muted)]">{emptyNote}</p>
  }

  return (
    <ol className="nfp-card divide-y divide-[var(--nfp-line)]">
      {tasks.map((task) => (
        <li className={`px-3 py-2 ${task.state === 'running' ? 'nfp-scan' : ''}`} key={task.id}>
          <div className="flex items-baseline gap-2">
            <span className="translate-y-0.5"><StateIcon state={task.state} /></span>
            <b className="min-w-0 flex-1 text-[11px] font-bold text-[var(--nfp-ink)]">{task.label}</b>
            <span className={`flex-none text-[8px] font-black uppercase tracking-wider ${stateTone[task.state]}`}>
              {stateLabel[task.state]}
            </span>
          </div>
          <code className="mt-0.5 block pl-5 font-mono text-[9px] text-[var(--nfp-muted)]">{task.command}</code>
          <p className="mt-0.5 pl-5 text-[10px] leading-snug text-[var(--nfp-muted)]">{task.result}</p>
        </li>
      ))}
    </ol>
  )
}
