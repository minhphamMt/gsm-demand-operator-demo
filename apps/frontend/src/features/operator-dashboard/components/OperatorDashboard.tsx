import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'

import { plansQuery, snapshotQuery, useOperatorActions } from '@/features/operator-data'
import { AiDecisionPanel } from '@/features/operator-dashboard/components/AiDecisionPanel'
import { ForecastToolbar } from '@/features/operator-dashboard/components/ForecastToolbar'
import { SnapshotStaleAlert } from '@/features/operator-dashboard/components/SnapshotStaleAlert'
import { ZoneDetailsDialog } from '@/features/operator-dashboard/components/ZoneDetailsDialog'
import { ZoneWatchlist } from '@/features/operator-dashboard/components/ZoneWatchlist'
import { projectZonesAtMinute } from '@/features/operator-dashboard/model/forecastProjection'
import { selectAiProposal } from '@/features/operator-dashboard/model/selectAiProposal'
import { DataRefreshState, EmptyState, ErrorState, Skeleton } from '@/shared/components/ui/FeedbackStates'
import { env } from '@/shared/config/env'

const OperatorMap = lazy(() => import('@/features/operator-map/components/OperatorMap').then(({ OperatorMap: MapComponent }) => ({ default: MapComponent })))

export function OperatorDashboard() {
  const [selectedZoneId, setSelectedZoneId] = useState<string>()
  const [forecastMinutes, setForecastMinutes] = useState(0)
  const snapshot = useQuery(snapshotQuery('baseline'))
  const plans = useQuery(plansQuery())
  const actions = useOperatorActions()

  if (snapshot.isPending) return <DashboardSkeleton />
  if (snapshot.isError && snapshot.data === undefined) return <ErrorState onRetry={() => void snapshot.refetch()} />
  if (!snapshot.data.zones.length) return <div className="space-y-3"><DataRefreshState hasError={snapshot.isRefetchError} isFetching={snapshot.isFetching} onRetry={() => void snapshot.refetch()} /><EmptyState title="Snapshot chưa có zone" description="Chưa có 30 bản ghi AI zone cho snapshot này; hãy kiểm tra pipeline ingestion." /></div>

  const projectedZones = projectZonesAtMinute(snapshot.data.zones, forecastMinutes)
  const selectedZone = projectedZones.find((zone) => zone.id === selectedZoneId)
  const aiPlan = selectAiProposal(plans.data)

  return <div className="flex flex-col gap-2 lg:h-full lg:overflow-hidden">
    <DataRefreshState hasError={snapshot.isRefetchError} isFetching={snapshot.isFetching} onRetry={() => void snapshot.refetch()} />
    <ForecastToolbar ai={snapshot.data.ai} forecastMinutes={forecastMinutes} generatedAt={snapshot.data.generatedAt} isLiveData={env.isLiveData} onForecastChange={setForecastMinutes} zoneCount={snapshot.data.zones.length} />
    <SnapshotStaleAlert generatedAt={snapshot.data.generatedAt} isRefreshing={snapshot.isFetching} onRefresh={() => void snapshot.refetch()} />
    <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,58fr)_minmax(220px,18fr)_minmax(310px,24fr)]">
      <section className="min-h-[520px] overflow-hidden rounded-panel border border-slate-200 bg-white shadow-panel lg:min-h-0"><Suspense fallback={<Skeleton className="h-full" />}><OperatorMap forecastMinutes={forecastMinutes} zones={projectedZones} selectedZoneId={selectedZoneId} onZoneSelect={setSelectedZoneId} /></Suspense></section>
      <div className="hidden min-h-0 xl:block"><ZoneWatchlist zones={projectedZones} selectedZoneId={selectedZoneId} onSelect={setSelectedZoneId} /></div>
      <AiDecisionPanel
        generationError={actions.generateAiDecision.error?.message}
        ai={snapshot.data.ai}
        isLiveData={env.isLiveData}
        isGenerating={actions.generateAiDecision.isPending}
        isLoading={plans.isPending}
        onGenerate={() => actions.generateAiDecision.mutate({ snapshotId: Number(snapshot.data.replayStep), horizonMinutes: forecastMinutes === 15 || forecastMinutes === 30 ? forecastMinutes : 15 })}
        plan={aiPlan}
      />
    </div>
    <ZoneDetailsDialog forecastMinutes={forecastMinutes} zone={selectedZone} onClose={() => setSelectedZoneId(undefined)} />
  </div>
}

function DashboardSkeleton() { return <div className="grid gap-3 lg:h-[calc(100vh-8rem)] lg:grid-rows-[84px_1fr]"><Skeleton /><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]"><Skeleton className="min-h-[520px]" /><Skeleton /></div></div> }
