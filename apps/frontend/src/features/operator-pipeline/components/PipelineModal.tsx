import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { RefreshCw, X } from 'lucide-react'

import { llmHealthQuery, type ForecastHorizon, type Snapshot } from '@/features/operator-data'
import { AgentModeBanner } from '@/features/operator-pipeline/components/AgentModeBanner'
import { ConnectTab } from '@/features/operator-pipeline/components/ConnectTab'
import type { ForecastControl } from '@/features/operator-pipeline/components/ForecastConfig'
import { OverviewTab } from '@/features/operator-pipeline/components/OverviewTab'
import { PipelinePanel } from '@/features/operator-pipeline/components/PipelinePanel'
import { useMetricHistory } from '@/features/operator-pipeline/hooks/useMetricHistory'
import type { AgentTask } from '@/features/operator-pipeline/model/agentTasks'
import type { PanelHorizon } from '@/features/operator-pipeline/model/horizonProjection'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { Button } from '@/shared/components/ui/Button'

import '@/features/operator-pipeline/operator-pipeline.css'

export type PipelineTabId = 'overview' | 'agents' | 'connect'

const tabTitle: Record<PipelineTabId, string> = {
  overview: 'Giám sát hệ thống',
  agents: 'Agent của lượt phân tích',
  connect: 'Sơ đồ luồng & phương án',
}

export type PipelineModalProps = {
  horizonMinutes: ForecastHorizon
  onClose: () => void
  snapshot: Snapshot
  tab: PipelineTabId
  onTabChange: (tab: PipelineTabId) => void
  snapshotId?: number | undefined
  isLive?: boolean | undefined
  onOpenPlan?: (() => void) | undefined
  planStatus?: readonly { label: string; value: string }[] | undefined
  tasks?: readonly AgentTask[] | undefined
  forecastControl?: ForecastControl | undefined
  contextLabel?: string | undefined
  // Nút quyết định của quy trình (duyệt / từ chối / phát lệnh / phát offer). Console dựng sẵn
  // rồi truyền vào: toàn bộ logic hai cổng phê duyệt ở lại console, panel chỉ đặt chỗ ngồi.
  decisionSlot?: ReactNode
  // Lượt phân tích do console giữ (MA-Q8), panel chỉ hiển thị. Bốn field optional để mọi nơi
  // render panel mà không quan tâm tới pipeline vẫn dựng được.
  run?: PipelineRunRecord | undefined
  runError?: string | undefined
  isStarting?: boolean | undefined
  onStart?: (() => void) | undefined
}

// Tab do bên ngoài giữ: thanh icon dọc ở rìa phải là bộ chuyển tab duy nhất, panel không có
// thanh tab riêng nữa. Tab `connect` mở dạng popup rộng vì sơ đồ và ba phương án không vừa
// bề ngang của flyout.
export function PipelineModal({ horizonMinutes, onClose, snapshot, tab, onTabChange, isLive = true, onOpenPlan, planStatus, tasks = [], forecastControl, contextLabel, decisionSlot, run, runError: error, isStarting = false, onStart }: PipelineModalProps) {
  const [focusedAgentId, setFocusedAgentId] = useState<string>()
  const [horizon, setHorizon] = useState<PanelHorizon>(0)
  const history = useMetricHistory(snapshot)
  const llmHealth = useQuery(llmHealthQuery())
  const isWide = tab === 'connect'

  const focusAgent = (agentId: string) => {
    setFocusedAgentId(agentId)
    onTabChange('connect')
  }

  return (
    <section
      aria-label="Autonomous Resolution Pipeline"
      className={`${isWide ? 'nf-pipeline-stage' : 'nf-pipeline-flyout'} flex flex-col`}
      data-surface="pipeline"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--nfp-line)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-black tracking-tight text-[var(--nfp-ink)]">{tabTitle[tab]}</h2>
          <p className="mt-0.5 truncate text-[10px] text-[var(--nfp-muted)]">
            Autonomous Resolution Pipeline · horizon phương án {horizonMinutes} phút
          </p>
        </div>
        <button aria-label="Đóng panel" className="grid size-7 flex-none place-items-center rounded-md text-[var(--nfp-muted)] hover:bg-[var(--nfp-raise-2)]" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-3 rounded-lg border border-[var(--nfp-crit)]/30 bg-[var(--nfp-crit-soft)] px-3 py-2 text-[11px] text-[var(--nfp-crit)]" role="alert">
            {error}
          </p>
        )}
        {run?.status === 'FAILED' && (
          <p className="mb-3 rounded-lg border border-[var(--nfp-crit)]/30 bg-[var(--nfp-crit-soft)] px-3 py-2 text-[11px] text-[var(--nfp-crit)]" role="alert">
            Pipeline thất bại: {run.error?.message ?? 'lỗi không xác định.'}
          </p>
        )}

        {tab === 'overview' && (
          <OverviewTab
            contextLabel={contextLabel}
            forecastControl={forecastControl}
            history={history}
            horizon={horizon}
            isLive={isLive}
            onHorizonChange={setHorizon}
            planStatus={planStatus}
            snapshot={snapshot}
          />
        )}
        {tab === 'agents' && (
          <PipelinePanel
            focusedAgentId={focusedAgentId}
            modeBanner={(
              <AgentModeBanner
                health={llmHealth.data}
                isLoading={llmHealth.isPending}
                onRetry={() => void llmHealth.refetch()}
              />
            )}
            onFocusAgent={focusAgent}
            run={run}
          />
        )}
        {tab === 'connect' && (
          <ConnectTab
            decisionSlot={decisionSlot}
            focusedAgentId={focusedAgentId}
            onFocusAgent={setFocusedAgentId}
            onOpenPlan={onOpenPlan}
            run={run}
            tasks={tasks}
          />
        )}
      </div>

      {isWide && (
        <footer className="flex items-center justify-end gap-3 border-t border-[var(--nfp-line)] px-4 py-2.5">
          <Button disabled={!onStart} isLoading={isStarting} onClick={onStart} variant="secondary">
            <RefreshCw className="size-3.5" />{run ? 'Chạy lại phân tích' : 'Chạy phân tích'}
          </Button>
        </footer>
      )}
    </section>
  )
}
