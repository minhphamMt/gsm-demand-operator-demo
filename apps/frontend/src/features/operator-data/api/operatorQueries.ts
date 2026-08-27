import { queryOptions } from '@tanstack/react-query'

import { operatorAdapter } from '@/features/operator-data/api/operatorAdapter'
import { isCampaignOperational } from '@/features/operator-data/model/campaignState'
import { isDispatchExecutionActive } from '@/features/operator-data/model/activeExecution'
import { snapshotPollInterval } from '@/features/operator-data/model/snapshotFreshness'
import type { AuditFilters, Campaign, DemoScenarioId, DispatchBatch, Offer, OperationsReportFilters, Scenario } from '@/features/operator-data/model/types'

// Operator lists are relatively large (audit, drivers, dispatch and
// notifications). Polling them every two seconds made an idle dashboard
// continuously download megabytes from Supabase through the API. Keep the
// console live, but refresh at an interval appropriate for human operations.
const pollingInterval = 60_000
const activeOperationPollingInterval = 15_000
const visibility = () => typeof document === 'undefined' ? 'visible' : document.visibilityState
type CampaignPollingState = Pick<Campaign, 'status'>
type DispatchPollingState = Pick<DispatchBatch, 'status'>
export const campaignPollInterval = (campaigns: readonly CampaignPollingState[] | undefined, pageVisibility = visibility()) => pageVisibility === 'visible' && (!campaigns || campaigns.some(isCampaignOperational)) ? activeOperationPollingInterval : false
export const offerPollInterval = (offers: readonly Pick<Offer, 'status'>[] | undefined, pageVisibility = visibility()) => pageVisibility === 'visible' && (!offers || offers.some((offer) => offer.status === 'Open')) ? activeOperationPollingInterval : false
export const dispatchPollInterval = (dispatches: readonly DispatchPollingState[] | undefined, pageVisibility = visibility()) => pageVisibility === 'visible' && (!dispatches || dispatches.some(isDispatchExecutionActive)) ? activeOperationPollingInterval : false
export const visiblePollInterval = (pageVisibility = visibility()) => pageVisibility === 'visible' ? pollingInterval : false

// Cấu hình gateway đổi theo `.env` của AI service, không đổi trong lúc thao tác — 60 giây là đủ.
export const llmHealthQuery = () => queryOptions({ queryKey: ['operator', 'llm-health'] as const, queryFn: operatorAdapter.getLlmHealth, staleTime: 60_000, retry: false })

export const operatorQueryKeys = { capabilities: ['operator', 'capabilities'] as const, dispatch: ['operator', 'dispatch'] as const, notifications: ['operator', 'notifications'] as const, snapshot: (comparison: Scenario, scenario: DemoScenarioId, replay: number) => ['operator', 'snapshot', comparison, scenario, replay] as const, replaySnapshot: (sourceAt: string) => ['operator', 'replay-snapshot', sourceAt] as const, baselines: ['operator', 'baselines'] as const, plans: ['operator', 'plans'] as const, plan: (id: string) => ['operator', 'plans', id] as const, campaigns: ['operator', 'campaigns'] as const, report: (filters: OperationsReportFilters) => ['operator', 'reports', 'operations', filters] as const, offerRoot: ['operator', 'offers'] as const, offers: (campaignId?: string) => ['operator', 'offers', campaignId ?? 'all'] as const, audit: ['operator', 'audit'] as const, auditPage: (filters: AuditFilters) => ['operator', 'audit', 'page', filters] as const, driverRoot: ['driver'] as const, drivers: ['driver', 'list'] as const, driver: (id: string) => ['driver', id] as const }
export const capabilitiesQuery = () => queryOptions({ queryKey: operatorQueryKeys.capabilities, queryFn: operatorAdapter.getCapabilities, staleTime: 30_000 })
export const dispatchQuery = () => queryOptions({ queryKey: operatorQueryKeys.dispatch, queryFn: operatorAdapter.listDispatch, refetchInterval: (query) => dispatchPollInterval(query.state.data), refetchIntervalInBackground: false })
export const notificationsQuery = () => queryOptions({ queryKey: operatorQueryKeys.notifications, queryFn: operatorAdapter.listNotifications, refetchInterval: () => visiblePollInterval(), refetchIntervalInBackground: false })
export const snapshotQuery = (comparison: Scenario, scenario: DemoScenarioId = 'rain-peak', replay = 0, autoRefresh = true) => queryOptions({ queryKey: operatorQueryKeys.snapshot(comparison, scenario, replay), queryFn: () => operatorAdapter.getSnapshot(comparison, scenario, replay), refetchInterval: () => autoRefresh ? snapshotPollInterval() : false, refetchIntervalInBackground: false, staleTime: 0 })
export const replayWindowQuery = (sourceAt: string) => queryOptions({ enabled: Boolean(sourceAt), queryKey: ['operator', 'replay-window', sourceAt] as const, queryFn: () => operatorAdapter.getReplayWindow(sourceAt), staleTime: Infinity })
export const replaySnapshotQuery = (sourceAt: string) => queryOptions({ enabled: Boolean(sourceAt), queryKey: operatorQueryKeys.replaySnapshot(sourceAt), queryFn: async () => {
  const snapshot = await operatorAdapter.runReplayStep(sourceAt)
  return snapshot.sourceAt === sourceAt ? snapshot : { ...snapshot, sourceAt }
}, gcTime: Infinity, retry: false, staleTime: Infinity })
export const baselinesQuery = () => queryOptions({ queryKey: operatorQueryKeys.baselines, queryFn: operatorAdapter.getBaselines, staleTime: Infinity })
export const operationsReportQuery = (filters: OperationsReportFilters) => queryOptions({ queryKey: operatorQueryKeys.report(filters), queryFn: () => operatorAdapter.getOperationsReport(filters), staleTime: 0 })
// Plans are refreshed by mutations and when the window regains focus. They do
// not need a background poll because the list is the largest operator payload.
export const plansQuery = () => queryOptions({ queryKey: operatorQueryKeys.plans, queryFn: operatorAdapter.listPlans, refetchInterval: false, staleTime: 30_000 })
export const planQuery = (id: string) => queryOptions({ queryKey: operatorQueryKeys.plan(id), queryFn: () => operatorAdapter.getPlan(id), staleTime: 0 })
export const campaignsQuery = () => queryOptions({ queryKey: operatorQueryKeys.campaigns, queryFn: operatorAdapter.listCampaigns, refetchInterval: (query) => campaignPollInterval(query.state.data), refetchIntervalInBackground: false })
export const offersQuery = (campaignId?: string) => queryOptions({ queryKey: operatorQueryKeys.offers(campaignId), queryFn: () => operatorAdapter.listOffers(campaignId), refetchInterval: (query) => offerPollInterval(query.state.data), refetchIntervalInBackground: false })
export const auditQuery = () => queryOptions({ queryKey: operatorQueryKeys.audit, queryFn: operatorAdapter.listAudit, refetchInterval: () => visiblePollInterval(), refetchIntervalInBackground: false, staleTime: 0 })
export const auditPageQuery = (filters: AuditFilters) => queryOptions({ queryKey: operatorQueryKeys.auditPage(filters), queryFn: () => operatorAdapter.queryAudit(filters), staleTime: 0 })
export const driversQuery = () => queryOptions({ queryKey: operatorQueryKeys.drivers, queryFn: operatorAdapter.listDrivers, refetchInterval: () => visiblePollInterval(), refetchIntervalInBackground: false })
export const driverViewQuery = (id: string) => queryOptions({ queryKey: operatorQueryKeys.driver(id), queryFn: () => operatorAdapter.getDriverView(id), refetchInterval: pollingInterval, refetchIntervalInBackground: false })
