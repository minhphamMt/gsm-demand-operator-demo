import type { AuditEntry, AuditPage, Baseline, Campaign, DemoDriver, DriverView, Offer, OperationsReport, Proposal, Snapshot } from '@/features/operator-data/model/types'
import { AppError } from '@/shared/api/client'

type Guard<T> = (value: unknown) => value is T

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const hasString = (value: Record<string, unknown>, key: string) => typeof value[key] === 'string'
const hasNumber = (value: Record<string, unknown>, key: string) => typeof value[key] === 'number'

export const isProposal: Guard<Proposal> = (value): value is Proposal => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'status') && hasString(value, 'title')
  && (value.targetZoneId === null || hasString(value, 'targetZoneId'))
  && (value.confidence === null || hasNumber(value, 'confidence')) && typeof value.simulationAvailable === 'boolean'
  && Array.isArray(value.moves) && Array.isArray(value.policyChecks)

export const isCampaign: Guard<Campaign> = (value): value is Campaign => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'planId') && hasString(value, 'status')
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
  && value.zones.every((zone) => isRecord(zone) && hasString(zone, 'id') && Array.isArray(zone.center) && Array.isArray(zone.boundary))
  && Array.isArray(value.hotspots) && isRecord(value.kpis)

export const isBaseline: Guard<Baseline> = (value): value is Baseline => isRecord(value)
  && (value.id === 'no-action' || value.id === 'historical-average') && hasString(value, 'label')
  && hasNumber(value, 'fulfillmentRate') && hasNumber(value, 'residualGap')

export const isOperationsReport: Guard<OperationsReport> = (value): value is OperationsReport => isRecord(value)
  && hasString(value, 'generatedAt') && (value.dataMode === 'DB_LEDGER' || value.dataMode === 'SIMULATED')
  && isRecord(value.summary) && hasNumber(value.summary, 'campaigns') && hasNumber(value.summary, 'qualifiedTrips')
  && Array.isArray(value.campaigns) && value.campaigns.every((campaign) => isRecord(campaign) && hasString(campaign, 'id') && hasNumber(campaign, 'budgetUsedVnd'))
  && isRecord(value.sources) && value.sources.netCostVnd === null

export const isAuditEntry: Guard<AuditEntry> = (value): value is AuditEntry => isRecord(value)
  && hasString(value, 'id') && hasString(value, 'planId') && hasString(value, 'action')
  && hasString(value, 'actor') && hasString(value, 'occurredAt')

export const isAuditPage: Guard<AuditPage> = (value): value is AuditPage => isRecord(value)
  && Array.isArray(value.items) && value.items.every(isAuditEntry)
  && hasNumber(value, 'page') && hasNumber(value, 'pageSize') && hasNumber(value, 'total')
  && hasNumber(value, 'totalPages') && typeof value.hasPreviousPage === 'boolean' && typeof value.hasNextPage === 'boolean'

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
