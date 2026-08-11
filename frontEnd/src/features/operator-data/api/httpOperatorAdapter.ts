import {
  isAuditPage,
  isBaseline,
  isCampaign,
  isDriver,
  isDriverView,
  isOffer,
  isOperationsReport,
  isProposal,
  isSnapshot,
  parseEntities,
  parseEntity,
} from '@/features/operator-data/api/responseGuards'
import type { AuditFilters, DemoScenario, OperationsReportFilters, OperatorDataAdapter, Proposal } from '@/features/operator-data/model/types'
import { AppError, requestJson } from '@/shared/api/client'

const body = (value: unknown) => JSON.stringify(value)
const auditSearch = (filters: AuditFilters) => {
  const search = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) })
  for (const [key, value] of Object.entries(filters)) if (key !== 'page' && key !== 'pageSize' && value) search.set(key, String(value))
  return search.toString()
}
const reportSearch = (filters: OperationsReportFilters) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value)
  return search.toString()
}
const unsupportedScenarios = async (): Promise<readonly DemoScenario[]> => {
  throw new AppError('Chức năng mô phỏng này không khả dụng khi dùng dữ liệu live.', { code: 'LIVE_UNSUPPORTED' })
}
const unsupportedAction = async (): Promise<void> => {
  throw new AppError('Chức năng mô phỏng này không khả dụng khi dùng dữ liệu live.', { code: 'LIVE_UNSUPPORTED' })
}

async function getPlan(planId: string): Promise<Proposal | undefined> {
  try {
    return parseEntity(await requestJson(`/operator/proposals/${planId}`), isProposal, 'proposal')
  } catch (cause) {
    if (cause instanceof AppError && cause.status === 404) return undefined
    throw cause
  }
}

export const httpOperatorAdapter: OperatorDataAdapter = {
  getSnapshot: async (scenario) => parseEntity(
    await requestJson(`/operator/snapshots/latest?scenario=${encodeURIComponent(scenario)}`),
    isSnapshot,
    'snapshot',
  ),
  listScenarios: unsupportedScenarios,
  getBaselines: async () => parseEntities(await requestJson('/operator/baselines'), isBaseline, 'baseline'),
  getOperationsReport: async (filters) => parseEntity(await requestJson(`/operator/reports/operations?${reportSearch(filters)}`), isOperationsReport, 'báo cáo vận hành'),
  loadScenario: unsupportedAction,
  resetDemo: unsupportedAction,
  listPlans: async () => parseEntities(await requestJson('/operator/proposals'), isProposal, 'proposal'),
  getPlan,
  listCampaigns: async () => parseEntities(await requestJson('/operator/campaigns'), isCampaign, 'campaign'),
  listOffers: async (campaignId) => parseEntities(
    await requestJson(`/operator/offers${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ''}`),
    isOffer,
    'offer',
  ),
  listAudit: async () => parseEntity(await requestJson('/operator/audit?page=1&pageSize=100'), isAuditPage, 'audit page').items,
  queryAudit: async (filters) => parseEntity(await requestJson(`/operator/audit?${auditSearch(filters)}`), isAuditPage, 'audit page'),
  revisePlan: async (planId, request) => {
    const plan = await getPlan(planId)
    if (!plan) throw new AppError('Không tìm thấy proposal cần chỉnh sửa.', { code: 'NOT_FOUND', status: 404 })
    const moves = plan.moves
      .map((move) => ({
        id: move.id,
        from_h3: request.moveSourceZoneIds[move.id] ?? move.sourceZoneId,
        to_h3: move.targetZoneId,
        drivers: request.moveQuantities[move.id] ?? move.quantity,
      }))
      .filter((move) => move.drivers !== 0)
    return parseEntity(await requestJson(`/operator/proposals/${planId}/revisions`, {
      method: 'POST',
      body: body({
        sourcePlan: { moves, residual_gap: [] },
        targetDriverCount: request.targetDriverCount,
        campaignDurationMinutes: request.campaignDurationMinutes,
        bonusAmount: request.relocationBonus,
        zoneTripBonus: request.zoneTripBonus,
        fareMultiplier: request.fareMultiplier,
        budgetLimit: request.budgetLimit,
        note: request.note,
      }),
    }), isProposal, 'proposal')
  },
  approvePlan: async (planId, note) => parseEntity(await requestJson(`/operator/proposals/${planId}/approve`, {
    method: 'POST', body: body({ note }),
  }), isProposal, 'proposal'),
  rejectPlan: async (planId, request) => parseEntity(await requestJson(`/operator/proposals/${planId}/reject`, {
    method: 'POST', body: body(request),
  }), isProposal, 'proposal'),
  startCampaign: async (planId, mode = 'mixed') => parseEntity(await requestJson(`/operator/proposals/${planId}/activate`, {
    method: 'POST', body: body({ responseMode: mode }),
  }), isCampaign, 'campaign'),
  cancelCampaign: async (campaignId) => parseEntity(await requestJson(`/operator/campaigns/${campaignId}/cancel`, {
    method: 'POST', body: body({}),
  }), isCampaign, 'campaign'),
  getDriverView: async (driverId) => {
    try {
      const path = driverId === 'me' ? '/driver/me' : `/drivers/${driverId}`
      return parseEntity(await requestJson(path), isDriverView, 'driver view')
    } catch (cause) {
      if (cause instanceof AppError && cause.status === 404) return undefined
      throw cause
    }
  },
  listDrivers: async () => parseEntities(await requestJson('/drivers'), isDriver, 'driver'),
  setDriverStatus: async (driverId, status) => parseEntity(await requestJson(`/drivers/${driverId}/status`, {
    method: 'PATCH', body: body({ status }),
  }), isDriver, 'driver'),
  respondToOffer: async (offerId, response) => parseEntity(await requestJson(`/offers/${offerId}/respond`, {
    method: 'POST', body: body({ response }),
  }), isOffer, 'offer'),
  expireOffer: async (offerId) => parseEntity(await requestJson(`/offers/${offerId}/expire`, {
    method: 'POST', body: body({}),
  }), isOffer, 'offer'),
}
