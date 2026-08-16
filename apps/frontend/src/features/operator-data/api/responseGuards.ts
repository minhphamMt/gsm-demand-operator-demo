import type { AuditEntry, AuditPage, Baseline, Campaign, DemoDriver, DispatchBatch, DriverView, Offer, OperationsReport, OperatorCapabilities, PersistentNotification, Proposal, ReplayTimelineStep, ScenarioComparison, Snapshot } from '@/features/operator-data/model/types'
import { AppError } from '@/shared/api/client'

type Guard<T> = (value: unknown) => value is T

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const hasString = (value: Record<string, unknown>, key: string) => typeof value[key] === 'string'
const hasNumber = (value: Record<string, unknown>, key: string) => typeof value[key] === 'number'
const hasNull = (value: Record<string, unknown>, key: string) => value[key] === null
const campaignStatuses = ['Draft', 'Scheduled', 'Active', 'Paused', 'TargetReached', 'Completed', 'Cancelled', 'BudgetExhausted', 'Running', 'Expired', 'Settling', 'Settled', 'Closed'] as const
const proposalStatuses = ['Generated', 'UnderReview', 'Revised', 'Approved', 'Rejected', 'Stale', 'FailedGeneration'] as const
const isCampaignStatus = (value: unknown): value is Campaign['status'] =>
  typeof value === 'string' && campaignStatuses.some((status) => status === value)
const isProposalStatus = (value: unknown): value is Proposal['status'] =>
  typeof value === 'string' && proposalStatuses.some((status) => status === value)
const hasCapabilityStates = (value: unknown) => isRecord(value)
  && ['forecastHorizons', 'proposalReview', 'dispatchRelease', 'dispatchReconciliation', 'activationRelease', 'compensationSettlement', 'scenarioComparison']
    .every((key) => {
      const capability = value[key]
      return isRecord(capability) && typeof capability.available === 'boolean' && typeof capability.enabled === 'boolean'
    })
const hasBudgetLifecycle = (value: unknown) => isRecord(value)
  && ['reservedVnd', 'committedVnd', 'qualifiedVnd', 'paidVnd', 'compensationDueVnd', 'releasedVnd'].every((key) => hasNumber(value, key))

export const isProposal: Guard<Proposal> = (value): value is Proposal => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'status') && hasString(value, 'title')
  && isProposalStatus(value.status)
  && (value.targetZoneId === null || hasString(value, 'targetZoneId'))
  && (value.confidence === null || hasNumber(value, 'confidence')) && typeof value.simulationAvailable === 'boolean'
  && Array.isArray(value.moves) && Array.isArray(value.policyChecks)

export const isCampaign: Guard<Campaign> = (value): value is Campaign => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'planId') && hasString(value, 'status')
  && isCampaignStatus(value.status)
  && hasNumber(value, 'offersSent') && hasNumber(value, 'accepted')

export const isOffer: Guard<Offer> = (value): value is Offer => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'campaignId') && hasString(value, 'driverId')
  && hasString(value, 'status') && hasNumber(value, 'incentiveAmount')

export const isDriver: Guard<DemoDriver> = (value): value is DemoDriver => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'name') && hasString(value, 'status')
  && Array.isArray(value.acceptedOfferIds) && hasNumber(value, 'rewardTotal')

export const isDriverView: Guard<DriverView> = (value): value is DriverView => isRecord(value)
  && isDriver(value.driver) && Array.isArray(value.activeOffers) && value.activeOffers.every(isOffer)
  && Array.isArray(value.acceptedOffers) && value.acceptedOffers.every(isOffer)
  && Array.isArray(value.history) && value.history.every(isOffer)

export const isSnapshot: Guard<Snapshot> = (value): value is Snapshot => isRecord(value)
  && hasString(value, 'generatedAt') && hasString(value, 'scenario') && Array.isArray(value.zones)
  && value.zones.every((zone) => isRecord(zone) && hasString(zone, 'id') && hasNumber(zone, 'aiZoneId')
    && hasString(zone, 'zoneCode') && (zone.dataStatus === 'live' || zone.dataStatus === 'missing')
    && (zone.dataStatus === 'live'
      ? hasNumber(zone, 'supply') && hasNumber(zone, 'demand') && hasNumber(zone, 'gap')
      : hasNull(zone, 'supply') && hasNull(zone, 'demand') && hasNull(zone, 'gap'))
    && hasNumber(zone, 'areaKm2') && hasNumber(zone, 'rainMmH')
    && hasNumber(zone, 'rainForecast15') && hasNumber(zone, 'rainForecast30')
    && Array.isArray(zone.center) && Array.isArray(zone.boundary))
  && Array.isArray(value.hotspots) && isRecord(value.kpis)

export const isReplayTimelineStep: Guard<ReplayTimelineStep> = (value): value is ReplayTimelineStep => isRecord(value)
  && hasString(value, 'sourceAt') && hasNumber(value, 'meanRainMmH')

export const isBaseline: Guard<Baseline> = (value): value is Baseline => isRecord(value)
  && (value.id === 'no-action' || value.id === 'historical-average') && hasString(value, 'label')
  && hasNumber(value, 'fulfillmentRate') && hasNumber(value, 'residualGap')

export const isOperationsReport: Guard<OperationsReport> = (value): value is OperationsReport => isRecord(value)
  && hasString(value, 'generatedAt') && (value.dataMode === 'DB_LEDGER' || value.dataMode === 'SIMULATED')
  && isRecord(value.summary) && hasNumber(value.summary, 'campaigns') && hasNumber(value.summary, 'qualifiedTrips')
  && hasBudgetLifecycle(value.summary)
  && Array.isArray(value.campaigns) && value.campaigns.every((campaign) => isRecord(campaign) && hasString(campaign, 'id') && hasNumber(campaign, 'budgetUsedVnd'))
  && isRecord(value.sources) && value.sources.netCostVnd === null

export const isAuditEntry: Guard<AuditEntry> = (value): value is AuditEntry => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'planId') && hasString(value, 'action')
  && hasString(value, 'actor') && hasString(value, 'occurredAt')

export const isAuditPage: Guard<AuditPage> = (value): value is AuditPage => isRecord(value)
  && Array.isArray(value.items) && value.items.every(isAuditEntry)
  && hasNumber(value, 'page') && hasNumber(value, 'pageSize') && hasNumber(value, 'total')
  && hasNumber(value, 'totalPages') && typeof value.hasPreviousPage === 'boolean' && typeof value.hasNextPage === 'boolean'

export const isOperatorCapabilities: Guard<OperatorCapabilities> = (value): value is OperatorCapabilities => isRecord(value)
  && hasString(value, 'serverTime') && value.timezone === 'Asia/Ho_Chi_Minh'
  && hasCapabilityStates(value.capabilities)

export const isDispatchBatch: Guard<DispatchBatch> = (value): value is DispatchBatch => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'proposalId') && hasNumber(value, 'proposalVersion')
  && hasString(value, 'approvedContentHash') && hasString(value, 'status') && hasString(value, 'releasedAt')
  && Array.isArray(value.moves) && value.moves.every((move) => isRecord(move)
    && hasString(move, 'id') && hasString(move, 'state') && hasNumber(move, 'plannedUnits')
    && hasNumber(move, 'acknowledgedUnits') && hasNumber(move, 'arrivedUnits')
    && hasNumber(move, 'availableUnits') && hasNumber(move, 'failedUnits'))
  && Array.isArray(value.reconciliations)

export const isScenarioComparison: Guard<ScenarioComparison> = (value): value is ScenarioComparison => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'commonInputHash') && hasString(value, 'snapshotId')
  && hasString(value, 'forecastRunId') && hasString(value, 'modelVersion') && hasString(value, 'policyVersion')
  && Array.isArray(value.scenarios) && value.scenarios.every((scenario) => isRecord(scenario)
    && hasString(scenario, 'type') && isRecord(scenario.estimatedMetrics) && isRecord(scenario.uncertainty)
    && hasString(scenario, 'responseSource'))
  && value.hasObservedRevenue === false && hasString(value, 'revenueNotice')

export const isPersistentNotification: Guard<PersistentNotification> = (value): value is PersistentNotification => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'severity') && hasString(value, 'category')
  && hasString(value, 'title') && hasString(value, 'message') && hasString(value, 'status')
  && hasString(value, 'createdAt')

export function parseEntity<T>(value: unknown, guard: Guard<T>, label: string): T {
  if (!guard(value)) throw new AppError(`Dữ liệu ${label} từ máy chủ không hợp lệ.`, { code: 'INVALID_RESPONSE' })
  return value
}

export function parseEntities<T>(value: unknown, guard: Guard<T>, label: string): readonly T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw new AppError(`Danh sách ${label} từ máy chủ không hợp lệ.`, { code: 'INVALID_RESPONSE' })
  }
  return value
}
