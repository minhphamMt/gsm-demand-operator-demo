import type { DemoScenarioId, Move, PolicyCheck, Proposal, RevisePlanRequest, SimulationMetrics } from '@/features/operator-data/model/types'
import { formatMultiplier } from '@/shared/lib/format'

const snapshotMetrics: SimulationMetrics = { fulfillmentRate: 88.4, residualGap: 66, deadheadKm: 0, budget: 0, expectedTrips: 42, avgWaitProxy: 7.8 }
const freshUntil = () => new Date(Date.now() + 8 * 60_000).toISOString()
const candidateSourceZones = [
  { zoneId: 'zone-01', label: 'Cầu Giấy 1', availableSupply: 16, distanceKm: 6.8, etaMinutes: 22 },
  { zoneId: 'zone-03', label: 'Đống Đa 1', availableSupply: 14, distanceKm: 3.4, etaMinutes: 12 },
  { zoneId: 'zone-07', label: 'Tây Hồ 1', availableSupply: 15, distanceKm: 5.6, etaMinutes: 18 },
  { zoneId: 'zone-09', label: 'Thanh Xuân 1', availableSupply: 13, distanceKm: 6.2, etaMinutes: 20 },
] as const

type Strategy = {
  title: string
  targetDriverCount: number
  relocationBonus: number
  zoneTripBonus: number
  fareMultiplier: number
  budgetLimit: number
  confidence: number
  moves: readonly Move[]
}

const strategies: readonly Strategy[] = [
  { title: 'Ưu tiên thời gian chờ', targetDriverCount: 8, relocationBonus: 60_000, zoneTripBonus: 12_000, fareMultiplier: 1, budgetLimit: 900_000, confidence: 0.92, moves: [move('MOV-01', 'zone-01', 'Cầu Giấy 1', 'zone-04', 'Hoàn Kiếm 1', 4, 6.8, 22, 12), move('MOV-02', 'zone-07', 'Tây Hồ 1', 'zone-04', 'Hoàn Kiếm 1', 4, 5.6, 18, 11)] },
  { title: 'Cân bằng hiệu quả và chi phí', targetDriverCount: 6, relocationBonus: 55_000, zoneTripBonus: 10_000, fareMultiplier: 1.05, budgetLimit: 650_000, confidence: 0.89, moves: [move('MOV-03', 'zone-03', 'Đống Đa 1', 'zone-04', 'Hoàn Kiếm 1', 3, 3.4, 12, 11), move('MOV-04', 'zone-07', 'Tây Hồ 1', 'zone-04', 'Hoàn Kiếm 1', 3, 5.6, 18, 12)] },
  { title: 'Kiểm soát ngân sách', targetDriverCount: 4, relocationBonus: 45_000, zoneTripBonus: 5_000, fareMultiplier: 1.1, budgetLimit: 350_000, confidence: 0.84, moves: [move('MOV-05', 'zone-01', 'Cầu Giấy 1', 'zone-04', 'Hoàn Kiếm 1', 2, 6.8, 22, 14), move('MOV-06', 'zone-09', 'Thanh Xuân 1', 'zone-04', 'Hoàn Kiếm 1', 2, 6.2, 20, 11)] },
]

function move(id: string, sourceZoneId: string, sourceZoneLabel: string, targetZoneId: string, targetZoneLabel: string, quantity: number, distanceKm: number, etaMinutes: number, sourceSupplyAfter: number): Move {
  return { id, sourceZoneId, sourceZoneLabel, targetZoneId, targetZoneLabel, quantity, distanceKm, etaMinutes, sourceSupplyAfter, estimatedCost: quantity * distanceKm * 4_000 }
}

function calculateMetrics(moves: readonly Move[]): SimulationMetrics {
  const units = moves.reduce((sum, relocation) => sum + relocation.quantity, 0)
  const deadheadKm = moves.reduce((sum, relocation) => sum + relocation.quantity * relocation.distanceKm, 0)
  return {
    fulfillmentRate: Math.min(95, Math.round((88.4 + units * 0.45) * 10) / 10),
    residualGap: Math.max(0, snapshotMetrics.residualGap - units),
    deadheadKm: Math.round(deadheadKm * 10) / 10,
    budget: Math.round(deadheadKm * 4_000),
    expectedTrips: snapshotMetrics.expectedTrips + Math.round(units * 1.2),
    avgWaitProxy: Math.max(5, Math.round((snapshotMetrics.avgWaitProxy - units * 0.18) * 10) / 10),
  }
}

function calculateEconomics(strategy: Pick<Proposal, 'targetDriverCount' | 'relocationBonus' | 'zoneTripBonus' | 'fareMultiplier'>, expectedTrips: number) {
  const incrementalTrips = Math.max(0, expectedTrips - snapshotMetrics.expectedTrips)
  const estimatedRewardCost = strategy.targetDriverCount * strategy.relocationBonus + incrementalTrips * strategy.zoneTripBonus
  const estimatedAdditionalRevenue = Math.round(incrementalTrips * 85_000 * (strategy.fareMultiplier - 1))
  return { estimatedRewardCost, estimatedAdditionalRevenue, estimatedNetCost: estimatedRewardCost - estimatedAdditionalRevenue }
}

function policyChecks(proposal: Pick<Proposal, 'budgetLimit' | 'candidateSourceZones' | 'estimatedRewardCost' | 'fareMultiplier' | 'moves' | 'inputFreshUntil'>): PolicyCheck[] {
  const hasSafeSources = proposal.candidateSourceZones.every((source) => source.availableSupply - proposal.moves.filter((relocation) => relocation.sourceZoneId === source.zoneId).reduce((sum, relocation) => sum + relocation.quantity, 0) >= 8)
  return [
    { id: 'POL-SOURCE', label: 'An toàn cung vùng nguồn', passed: hasSafeSources, blocking: true, detail: hasSafeSources ? 'Mọi vùng nguồn còn tối thiểu 8 xe sẵn sàng sau điều chuyển.' : 'Có vùng nguồn xuống dưới ngưỡng 8 xe sẵn sàng.' },
    { id: 'POL-DISTANCE', label: 'Khoảng cách và ETA', passed: proposal.moves.every((relocation) => relocation.distanceKm <= 8 && relocation.etaMinutes <= 25), blocking: true, detail: 'Giới hạn 8 km và 25 phút cho mỗi lệnh.' },
    { id: 'POL-BUDGET', label: 'Ngân sách thưởng', passed: proposal.estimatedRewardCost <= proposal.budgetLimit, blocking: true, detail: `${proposal.estimatedRewardCost.toLocaleString('vi-VN')}đ / ${proposal.budgetLimit.toLocaleString('vi-VN')}đ.` },
    { id: 'POL-FARE', label: 'Hệ số giá khách hàng', passed: proposal.fareMultiplier <= 1.2, blocking: true, detail: `Mức ${formatMultiplier(proposal.fareMultiplier)}, trần chính sách 1,2x.` },
    { id: 'POL-FRESH', label: 'Độ mới snapshot', passed: new Date(proposal.inputFreshUntil) >= new Date(), blocking: true, detail: 'Snapshot có hiệu lực trong 8 phút kể từ lúc sinh đề xuất.' },
  ]
}

function completeProposal(base: Omit<Proposal, 'policyChecks' | 'warnings'>): Proposal {
  const checks = policyChecks(base)
  const warnings: Proposal['warnings'] = [
    ...(base.metrics.residualGap > 20 ? [{ id: 'WARN-GAP', severity: 'warning' as const, title: 'Còn thiếu xe sau điều chuyển', detail: `Còn ${base.metrics.residualGap} xe; cần quyết định huy động tài xế riêng sau khi duyệt.` }] : []),
    ...(base.estimatedRewardCost / base.budgetLimit > 0.85 ? [{ id: 'WARN-BUDGET', severity: 'warning' as const, title: 'Ngân sách gần ngưỡng', detail: 'Chi phí thưởng dự kiến sử dụng trên 85% hạn mức.' }] : []),
  ]
  return { ...base, policyChecks: checks, warnings }
}

export function createAgentPlans(scenarioId: DemoScenarioId, startingPlanNumber = 42): Proposal[] {
  const scenarioLabel: Record<DemoScenarioId, string> = { normal: 'ngày thường', 'rain-peak': 'mưa cao điểm', holiday: 'lễ hội cuối tuần' }
  const createdAt = new Date().toISOString()
  const snapshotSuffix = createdAt.replace(/\D/g, '').slice(0, 12)
  return strategies.map((strategy, index) => {
    const metrics = calculateMetrics(strategy.moves)
    const economics = calculateEconomics(strategy, metrics.expectedTrips)
    const id = `PLN-${String(startingPlanNumber + index).padStart(3, '0')}`
    return completeProposal({
      id, rootProposalId: id, parentProposalId: null, title: `${strategy.title} — ${scenarioLabel[scenarioId]}`, status: 'UnderReview', createdAt, version: 1, rank: index + 1,
      scenarioId, generatorType: 'AGENT', generatorVersion: 'gsm14-agent/1.4.0', inputSnapshotId: `SNP-${scenarioId}-${snapshotSuffix}`, hotspotId: `HOT-04-${snapshotSuffix}`, targetZoneId: 'zone-04', targetZoneLabel: 'Hoàn Kiếm 1', confidence: strategy.confidence, candidateSourceZones,
      moves: strategy.moves, simulationAvailable: true, targetDriverCount: strategy.targetDriverCount, expectedOfferCount: Math.ceil(strategy.targetDriverCount * 1.5), eligibleDriverCount: 12, averageDistanceKm: weightedAverage(strategy.moves, 'distanceKm'), averageEtaMinutes: weightedAverage(strategy.moves, 'etaMinutes'), campaignDurationMinutes: 45,
      relocationBonus: strategy.relocationBonus, zoneTripBonus: strategy.zoneTripBonus, fareMultiplier: strategy.fareMultiplier, budgetLimit: strategy.budgetLimit, ...economics,
      metricsBefore: snapshotMetrics, metrics, explanation: [`Hoàn Kiếm 1 thiếu 10 xe hiện tại và dự báo thiếu 14 xe sau 15 phút trong kịch bản ${scenarioLabel[scenarioId]}.`, `Điều ${strategy.moves.reduce((sum, relocation) => sum + relocation.quantity, 0)} xe từ vùng còn dư; mỗi vùng nguồn vẫn giữ tối thiểu 8 xe sẵn sàng.`, `Xếp hạng ${index + 1}/3 theo mục tiêu “${strategy.title.toLowerCase()}” và chi phí thưởng chỉ tính trên chuyến tăng thêm.`], inputFreshUntil: freshUntil(),
    })
  })
}

export function reviseAgentPlan(plan: Proposal, request: RevisePlanRequest, revisedId = `${plan.id}-V${plan.version + 1}`): Proposal {
  const revisedMoves = plan.moves.map((relocation) => {
    const quantity = request.moveQuantities[relocation.id] ?? relocation.quantity
    const sourceZoneId = request.moveSourceZoneIds[relocation.id] ?? relocation.sourceZoneId
    const source = plan.candidateSourceZones.find((candidate) => candidate.zoneId === sourceZoneId)
    if (!source) return { ...relocation, quantity, estimatedCost: quantity * relocation.distanceKm * 4_000 }
    return { ...relocation, sourceZoneId, sourceZoneLabel: source.label, quantity, distanceKm: source.distanceKm, etaMinutes: source.etaMinutes, sourceSupplyAfter: source.availableSupply - quantity, estimatedCost: quantity * source.distanceKm * 4_000 }
  }).filter((relocation) => relocation.quantity > 0)
  const moves = revisedMoves.map((relocation) => { const source = plan.candidateSourceZones.find((candidate) => candidate.zoneId === relocation.sourceZoneId); const quantityFromSource = revisedMoves.filter((candidate) => candidate.sourceZoneId === relocation.sourceZoneId).reduce((sum, candidate) => sum + candidate.quantity, 0); return { ...relocation, sourceSupplyAfter: (source?.availableSupply ?? relocation.sourceSupplyAfter + relocation.quantity) - quantityFromSource } })
  const metrics = calculateMetrics(moves)
  const economics = calculateEconomics(request, metrics.expectedTrips)
  const { moveQuantities: _moveQuantities, moveSourceZoneIds: _moveSourceZoneIds, note: _note, ...parameters } = request
  return completeProposal({ ...plan, ...parameters, ...economics, id: revisedId, rootProposalId: plan.rootProposalId, parentProposalId: plan.id, moves, metrics, status: 'Revised', version: plan.version + 1, createdAt: new Date().toISOString(), expectedOfferCount: Math.ceil(request.targetDriverCount * 1.5), averageDistanceKm: weightedAverage(moves, 'distanceKm'), averageEtaMinutes: weightedAverage(moves, 'etaMinutes'), inputFreshUntil: freshUntil(), explanation: [...plan.explanation.slice(0, 2), `Mô phỏng lại phiên bản ${plan.version + 1} sau chỉnh sửa: ${request.note}`] })
}

function weightedAverage(moves: readonly Move[], field: 'distanceKm' | 'etaMinutes') {
  const units = moves.reduce((sum, relocation) => sum + relocation.quantity, 0)
  if (units === 0) return 0
  return Math.round(moves.reduce((sum, relocation) => sum + relocation[field] * relocation.quantity, 0) / units * 10) / 10
}
