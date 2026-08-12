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
import { latestAgentProposalForSnapshot } from '@/features/operator-data/model/proposalSelection'
import { AppError, requestJson } from '@/shared/api/client'

const body = (value: unknown) => JSON.stringify(value)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
type ReplayForecastZone = { zone_id: number; predicted_demand: number; predicted_supply: number }
const isReplayForecastZone = (value: unknown): value is ReplayForecastZone => isRecord(value)
  && typeof value.zone_id === 'number' && typeof value.predicted_demand === 'number' && typeof value.predicted_supply === 'number'
const aiZoneNumber = (value: string) => Number(value.replace(/^AI-Z/i, ''))
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
  generateAiDecision: async (snapshotId, horizonMinutes) => {
    await requestJson('/operator/ai/forecast', { method: 'POST', body: body({ snapshotId, horizonMinutes }) })
    return parseEntity(await requestJson(`/operator/snapshots/${snapshotId}?scenario=baseline`), isSnapshot, 'snapshot dự báo')
  },
  optimizeAiDecision: async (snapshotId, horizonMinutes) => {
    await requestJson('/operator/ai/optimize', { method: 'POST', body: body({ snapshotId, horizonMinutes }) })
    const proposals = parseEntities(await requestJson('/operator/proposals'), isProposal, 'proposals')
    const proposal = latestAgentProposalForSnapshot(proposals, String(snapshotId))
    if (!proposal) throw new AppError('Model không trả về phương án cho đúng snapshot đang xem.', { code: 'AI_PROPOSAL_SNAPSHOT_MISMATCH' })
    return proposal
  },
  runReplayStep: async (sourceAt) => {
    const result = await requestJson('/operator/ai/replay', { method: 'POST', body: body({ sourceAt }) })
    if (!result || typeof result !== 'object' || !('snapshot' in result) || !result.snapshot || typeof result.snapshot !== 'object' || !('id' in result.snapshot) || typeof result.snapshot.id !== 'number') throw new AppError('Kết quả chạy model replay không hợp lệ.', { code: 'INVALID_RESPONSE' })
    const snapshot = parseEntity(await requestJson(`/operator/snapshots/${result.snapshot.id}?scenario=baseline`), isSnapshot, 'snapshot replay')
    if (!('decision' in result) || !isRecord(result.decision) || !isRecord(result.decision.forecast)) throw new AppError('Model không trả về dự báo replay.', { code: 'INVALID_RESPONSE' })
    const forecast = result.decision.forecast
    if (!Array.isArray(forecast.zones) || typeof forecast.forecast_ts !== 'string' || typeof forecast.model_version !== 'string') throw new AppError('Dữ liệu dự báo +5 phút không hợp lệ.', { code: 'INVALID_RESPONSE' })
    const predictedByZone = new Map(forecast.zones.filter(isReplayForecastZone).map((value) => [value.zone_id, value]))
    if (predictedByZone.size !== 30) throw new AppError('Model phải trả đủ dự báo cho 30 zone.', { code: 'INVALID_RESPONSE' })
    return {
      ...snapshot,
      ai: { ...(snapshot.ai ?? { zoneContract: 'AI_ZONE_1_30', registeredZones: 30, liveZones: 30, forecastedZones: 30 }), horizons: [5], modelVersion: forecast.model_version, forecastMode: 'trained_model_replay', dataSource: `project_parquet_replay→ai_zone_observations:${result.snapshot.id}`, forecastAt: forecast.forecast_ts },
      zones: snapshot.zones.map((zone) => {
        const prediction = predictedByZone.get(zone.aiZoneId)
        if (!prediction) throw new AppError(`Model thiếu dự báo cho ${zone.zoneCode}.`, { code: 'INVALID_RESPONSE' })
        return { ...zone, forecast5: Number(prediction.predicted_demand), forecastSupply5: Number(prediction.predicted_supply) }
      }),
    }
  },
  getReplayWindow: async (sourceAt) => {
    const response = await requestJson('/operator/ai/replay-window', { method: 'POST', body: body({ sourceAt }) })
    if (!response || typeof response !== 'object' || !('steps' in response) || !Array.isArray(response.steps)) throw new AppError('Dữ liệu timeline replay từ máy chủ không hợp lệ.', { code: 'INVALID_RESPONSE' })
    return response.steps.map((step) => {
      if (!step || typeof step !== 'object' || !('source_at' in step) || !('mean_rain_mm_h' in step) || typeof step.source_at !== 'string' || typeof step.mean_rain_mm_h !== 'number') throw new AppError('Mốc replay từ máy chủ không hợp lệ.', { code: 'INVALID_RESPONSE' })
      return { sourceAt: step.source_at, meanRainMmH: step.mean_rain_mm_h }
    })
  },
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
        from_zone: aiZoneNumber(request.moveSourceZoneIds[move.id] ?? move.sourceZoneId),
        to_zone: aiZoneNumber(move.targetZoneId),
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
  startCampaign: async (planId, mode = 'human') => parseEntity(await requestJson(`/operator/proposals/${planId}/activate`, {
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
