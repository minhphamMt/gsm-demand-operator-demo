import {
  isAuditPage,
  isBaseline,
  isCampaign,
  isDispatchBatch,
  isDriver,
  isDriverView,
  isOffer,
  isOperationsReport,
  isOperatorCapabilities,
  isPersistentNotification,
  isProposal,
  isSnapshot,
  isScenarioComparison,
  parseEntities,
  parseEntity,
} from '@/features/operator-data/api/responseGuards'
import { runIdempotentCommand } from '@/features/operator-data/api/commandIdempotency'
import type { AuditFilters, DemoScenario, OperationsReportFilters, OperatorDataAdapter, Proposal } from '@/features/operator-data/model/types'
import {
  latestAgentProposalForSnapshot,
  latestAgentProposalRecordForSnapshot,
} from '@/features/operator-data/model/proposalSelection'
import { isPipelineRunRecord, isRunEvent, readLlmHealth } from '@/features/operator-pipeline/model/pipelineRunGuard'
import { AppError, requestJson } from '@/shared/api/client'

const body = (value: unknown) => JSON.stringify(value)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const aiZoneNumber = (value: string) => Number(value.replace(/^AI-Z/i, ''))
const failedOptimizationReason = (decision: Record<string, unknown> | undefined) => {
  const plan = decision?.plan
  if (isRecord(plan) && Array.isArray(plan.warnings)) {
    const warning = plan.warnings.find((item) => isRecord(item) && item.code === 'NO_SOLUTION')
    if (isRecord(warning) && typeof warning.code === 'string') return warning.code
  }
  return 'NO_VALID_OPERATIONAL_PLAN'
}
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
  getCapabilities: async () => parseEntity(await requestJson('/operator/capabilities'), isOperatorCapabilities, 'capability'),
  generateAiDecision: async (snapshotId, horizonMinutes) => {
    const result = await requestJson('/operator/ai/forecast', { method: 'POST', body: body({ snapshotId, horizonMinutes }) })
    const refreshedSnapshotId = isRecord(result) && isRecord(result.snapshot) && typeof result.snapshot.id === 'number'
      ? result.snapshot.id
      : snapshotId
    return parseEntity(await requestJson(`/operator/snapshots/${refreshedSnapshotId}?scenario=baseline`), isSnapshot, 'snapshot dự báo')
  },
  optimizeAiDecision: async (snapshotId, horizonMinutes) => {
    const result = await requestJson('/operator/ai/optimize', { method: 'POST', body: body({ snapshotId, horizonMinutes }) })
    const decision = isRecord(result) && isRecord(result.decision) ? result.decision : undefined
    if (decision?.planning_status === 'not_required') {
      return {
        planningStatus: 'not_required',
        reasonCode: typeof decision.reason_code === 'string' ? decision.reason_code : 'NO_ACTION_REQUIRED',
      }
    }
    const proposals = parseEntities(await requestJson('/operator/proposals'), isProposal, 'proposals')
    const latestRecord = latestAgentProposalRecordForSnapshot(proposals, String(snapshotId))
    if (latestRecord?.status === 'FailedGeneration') {
      return { planningStatus: 'not_required', reasonCode: failedOptimizationReason(decision) }
    }
    const proposal = latestAgentProposalForSnapshot(proposals, String(snapshotId))
    if (!proposal) throw new AppError('Model không trả về phương án cho đúng snapshot đang xem.', { code: 'AI_PROPOSAL_SNAPSHOT_MISMATCH' })
    return { planningStatus: 'proposal_created', proposal }
  },
  runReplayStep: async (sourceAt) => {
    const result = await requestJson('/operator/ai/replay', { method: 'POST', body: body({ sourceAt }) })
    if (!isRecord(result) || !isRecord(result.snapshot) || typeof result.snapshot.id !== 'number') {
      throw new AppError('Kết quả nạp dữ liệu replay không hợp lệ.', { code: 'INVALID_RESPONSE' })
    }
    return parseEntity(
      await requestJson(`/operator/snapshots/${result.snapshot.id}?scenario=baseline`),
      isSnapshot,
      'snapshot replay',
    )
  },
  getReplayWindow: async (sourceAt, lookbackMinutes) => {
    const response = await requestJson('/operator/ai/replay-window', { method: 'POST', body: body(lookbackMinutes ? { sourceAt, lookbackMinutes } : { sourceAt }) })
    if (!response || typeof response !== 'object' || !('steps' in response) || !Array.isArray(response.steps)) throw new AppError('Dữ liệu timeline replay từ máy chủ không hợp lệ.', { code: 'INVALID_RESPONSE' })
    return response.steps.map((step) => {
      if (!step || typeof step !== 'object' || !('source_at' in step) || !('mean_rain_mm_h' in step) || typeof step.source_at !== 'string' || typeof step.mean_rain_mm_h !== 'number') throw new AppError('Mốc replay từ máy chủ không hợp lệ.', { code: 'INVALID_RESPONSE' })
      // Hai tổng là field optional: mốc cũ không có thì bỏ qua, không dựng số 0 giả.
      return {
        sourceAt: step.source_at,
        meanRainMmH: step.mean_rain_mm_h,
        ...('total_demand' in step && typeof step.total_demand === 'number' ? { totalDemand: step.total_demand } : {}),
        ...('total_supply' in step && typeof step.total_supply === 'number' ? { totalSupply: step.total_supply } : {}),
      }
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
        expectedVersion: request.expectedVersion,
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
  approvePlan: async (planId, expectedVersion, note) => runIdempotentCommand(
    'proposal-approve', { planId, expectedVersion, note },
    async (idempotencyKey) => parseEntity(await requestJson(`/operator/proposals/${planId}/approve`, {
      method: 'POST', headers: { 'x-idempotency-key': idempotencyKey }, body: body({ expectedVersion, note }),
    }), isProposal, 'proposal'),
  ),
  rejectPlan: async (planId, request) => runIdempotentCommand(
    'proposal-reject', { planId, ...request },
    async (idempotencyKey) => parseEntity(await requestJson(`/operator/proposals/${planId}/reject`, {
      method: 'POST', headers: { 'x-idempotency-key': idempotencyKey }, body: body(request),
    }), isProposal, 'proposal'),
  ),
  cancelApprovedPlan: async (planId, reason) => parseEntity(await requestJson(`/operator/proposals/${planId}/cancel`, {
    method: 'POST', body: body({ reason }),
  }), isProposal, 'proposal'),
  startCampaign: async (planId, mode = 'human') => parseEntity(await requestJson(`/operator/proposals/${planId}/activate`, {
    method: 'POST', body: body({ responseMode: mode }),
  }), isCampaign, 'campaign'),
  cancelCampaign: async (campaignId) => parseEntity(await requestJson(`/operator/campaigns/${campaignId}/cancel`, {
    method: 'POST', body: body({ reason: 'Operator cancelled after impact review.', disposition: 'RELEASE_OPEN_AND_COMPENSATE_ACCEPTED', policyVersion: 'policy-v1' }),
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
  listDispatch: async () => parseEntities(await requestJson('/operator/dispatch'), isDispatchBatch, 'dispatch'),
  releaseDispatch: async (planId) => runIdempotentCommand(
    'dispatch-release', { planId },
    async (idempotencyKey) => parseEntity(await requestJson(`/operator/proposals/${planId}/dispatch`, {
      method: 'POST', headers: { 'x-idempotency-key': idempotencyKey }, body: body({}),
    }), isDispatchBatch, 'dispatch'),
  ),
  cancelDispatch: async (batchId, reason) => parseEntity(await requestJson(`/operator/dispatch/${batchId}/cancel`, {
    method: 'POST', body: body({ reason }),
  }), isDispatchBatch, 'dispatch'),
  retryDispatchMove: async (batchId, moveId, reason) => parseEntity(await requestJson(`/operator/dispatch/${batchId}/moves/${moveId}/retry`, {
    method: 'POST', body: body({ reason }),
  }), isDispatchBatch, 'dispatch'),
  compareScenarios: async (planId) => parseEntity(await requestJson('/operator/scenarios/compare', {
    method: 'POST', body: body({ proposalId: planId }),
  }), isScenarioComparison, 'so sÃ¡nh ká»‹ch báº£n'),
  listNotifications: async () => parseEntities(await requestJson('/operator/notifications'), isPersistentNotification, 'thÃ´ng bÃ¡o'),
  acknowledgeAllNotifications: async () => parseEntities(await requestJson('/operator/notifications/acknowledge-all', {
    method: 'POST', body: body({}),
  }), isPersistentNotification, 'notifications'),
  acknowledgeNotification: async (notificationId) => parseEntity(await requestJson(`/operator/notifications/${notificationId}/acknowledge`, {
    method: 'POST', body: body({}),
  }), isPersistentNotification, 'thÃ´ng bÃ¡o'),
  startPipelineRun: async (horizonMinutes, snapshotId) => {
    const result = await requestJson('/operator/ai/runs', { method: 'POST', body: body({ horizonMinutes, snapshotId }) })
    const runId = isRecord(result) ? (typeof result.runId === 'string' ? result.runId : typeof result.run_id === 'string' ? result.run_id : undefined) : undefined
    if (!runId) throw new AppError('Kết quả khởi động pipeline không hợp lệ.', { code: 'INVALID_RESPONSE' })
    return { runId, status: isRecord(result) && typeof result.status === 'string' ? result.status : 'RUNNING' }
  },
  getPipelineRun: async (runId) => {
    const result = await requestJson(`/operator/ai/runs/${encodeURIComponent(runId)}`)
    if (!isPipelineRunRecord(result)) throw new AppError('Trạng thái pipeline trả về không hợp lệ.', { code: 'INVALID_RESPONSE' })
    return result
  },
  askAgent: async ({ sessionId, text, horizonMinutes, snapshotId }) => {
    const result = await requestJson('/operator/ai/observe', {
      method: 'POST',
      body: body({ sessionId, text, horizonMinutes, ...(snapshotId === undefined ? {} : { snapshotId }) }),
    })
    if (!isRecord(result)) throw new AppError('Phản hồi của agent không hợp lệ.', { code: 'INVALID_RESPONSE' })
    return {
      sessionId: typeof result.session_id === 'string' ? result.session_id : sessionId,
      action: typeof result.action === 'string' ? result.action : null,
    }
  },
  getAgentSession: async (sessionId) => {
    const result = await requestJson(`/operator/ai/observe/${encodeURIComponent(sessionId)}`)
    // Nới tay như guard của run: phiên chưa có gì là trạng thái bình thường, không phải lỗi.
    if (!isRecord(result) || !Array.isArray(result.events)) return []
    return result.events.filter(isRunEvent)
  },
  getLlmHealth: async () => {
    const health = readLlmHealth(await requestJson('/operator/ai/llm/health'))
    if (!health) throw new AppError('Không đọc được cấu hình gateway LLM.', { code: 'INVALID_RESPONSE' })
    return health
  },
}
