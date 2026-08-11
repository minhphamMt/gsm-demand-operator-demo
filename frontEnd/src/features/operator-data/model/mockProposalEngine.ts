import type { DemoScenarioId, Move, PolicyCheck, Proposal, RevisePlanRequest, SimulationMetrics } from '@/features/operator-data/model/types'
import { formatMultiplier } from '@/shared/lib/format'

const snapshotMetrics: SimulationMetrics = { fulfillmentRate: 88.4, residualGap: 66, deadheadKm: 0, budget: 0, expectedTrips: 42, avgWaitProxy: 7.8 }
const freshUntil = () => new Date(Date.now() + 8 * 60_000).toISOString()
const candidateSourceZones = [
  { zoneId: 'AI-Z06', label: 'Cáº§u Giáº¥y 1', availableSupply: 16, distanceKm: 6.8, etaMinutes: 22 },
  { zoneId: 'AI-Z04', label: 'Äá»‘ng Äa 1', availableSupply: 14, distanceKm: 3.4, etaMinutes: 12 },
  { zoneId: 'AI-Z05', label: 'TÃ¢y Há»“ 1', availableSupply: 15, distanceKm: 5.6, etaMinutes: 18 },
  { zoneId: 'AI-Z07', label: 'Thanh XuÃ¢n 1', availableSupply: 13, distanceKm: 6.2, etaMinutes: 20 },
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
  { title: 'Æ¯u tiÃªn thá»i gian chá»', targetDriverCount: 8, relocationBonus: 60_000, zoneTripBonus: 12_000, fareMultiplier: 1, budgetLimit: 900_000, confidence: 0.92, moves: [move('MOV-01', 'AI-Z06', 'Cáº§u Giáº¥y 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 4, 6.8, 22, 12), move('MOV-02', 'AI-Z05', 'TÃ¢y Há»“ 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 4, 5.6, 18, 11)] },
  { title: 'CÃ¢n báº±ng hiá»‡u quáº£ vÃ  chi phÃ­', targetDriverCount: 6, relocationBonus: 55_000, zoneTripBonus: 10_000, fareMultiplier: 1.05, budgetLimit: 650_000, confidence: 0.89, moves: [move('MOV-03', 'AI-Z04', 'Äá»‘ng Äa 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 3, 3.4, 12, 11), move('MOV-04', 'AI-Z05', 'TÃ¢y Há»“ 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 3, 5.6, 18, 12)] },
  { title: 'Kiá»ƒm soÃ¡t ngÃ¢n sÃ¡ch', targetDriverCount: 4, relocationBonus: 45_000, zoneTripBonus: 5_000, fareMultiplier: 1.1, budgetLimit: 350_000, confidence: 0.84, moves: [move('MOV-05', 'AI-Z06', 'Cáº§u Giáº¥y 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 2, 6.8, 22, 14), move('MOV-06', 'AI-Z07', 'Thanh XuÃ¢n 1', 'AI-Z02', 'HoÃ n Kiáº¿m 1', 2, 6.2, 20, 11)] },
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
    { id: 'POL-SOURCE', label: 'An toÃ n cung vÃ¹ng nguá»“n', passed: hasSafeSources, blocking: true, detail: hasSafeSources ? 'Má»i vÃ¹ng nguá»“n cÃ²n tá»‘i thiá»ƒu 8 xe sáºµn sÃ ng sau Ä‘iá»u chuyá»ƒn.' : 'CÃ³ vÃ¹ng nguá»“n xuá»‘ng dÆ°á»›i ngÆ°á»¡ng 8 xe sáºµn sÃ ng.' },
    { id: 'POL-DISTANCE', label: 'Khoáº£ng cÃ¡ch vÃ  ETA', passed: proposal.moves.every((relocation) => relocation.distanceKm <= 8 && relocation.etaMinutes <= 25), blocking: true, detail: 'Giá»›i háº¡n 8 km vÃ  25 phÃºt cho má»—i lá»‡nh.' },
    { id: 'POL-BUDGET', label: 'NgÃ¢n sÃ¡ch thÆ°á»Ÿng', passed: proposal.estimatedRewardCost <= proposal.budgetLimit, blocking: true, detail: `${proposal.estimatedRewardCost.toLocaleString('vi-VN')}Ä‘ / ${proposal.budgetLimit.toLocaleString('vi-VN')}Ä‘.` },
    { id: 'POL-FARE', label: 'Há»‡ sá»‘ giÃ¡ khÃ¡ch hÃ ng', passed: proposal.fareMultiplier <= 1.2, blocking: true, detail: `Má»©c ${formatMultiplier(proposal.fareMultiplier)}, tráº§n chÃ­nh sÃ¡ch 1,2x.` },
    { id: 'POL-FRESH', label: 'Äá»™ má»›i snapshot', passed: new Date(proposal.inputFreshUntil) >= new Date(), blocking: true, detail: 'Snapshot cÃ³ hiá»‡u lá»±c trong 8 phÃºt ká»ƒ tá»« lÃºc sinh Ä‘á» xuáº¥t.' },
  ]
}

function completeProposal(base: Omit<Proposal, 'policyChecks' | 'warnings'>): Proposal {
  const checks = policyChecks(base)
  const warnings: Proposal['warnings'] = [
    ...(base.metrics.residualGap > 20 ? [{ id: 'WARN-GAP', severity: 'warning' as const, title: 'CÃ²n thiáº¿u xe sau Ä‘iá»u chuyá»ƒn', detail: `CÃ²n ${base.metrics.residualGap} xe; cáº§n quyáº¿t Ä‘á»‹nh huy Ä‘á»™ng tÃ i xáº¿ riÃªng sau khi duyá»‡t.` }] : []),
    ...(base.estimatedRewardCost / base.budgetLimit > 0.85 ? [{ id: 'WARN-BUDGET', severity: 'warning' as const, title: 'NgÃ¢n sÃ¡ch gáº§n ngÆ°á»¡ng', detail: 'Chi phÃ­ thÆ°á»Ÿng dá»± kiáº¿n sá»­ dá»¥ng trÃªn 85% háº¡n má»©c.' }] : []),
  ]
  return { ...base, policyChecks: checks, warnings }
}

export function createAgentPlans(scenarioId: DemoScenarioId, startingPlanNumber = 42): Proposal[] {
  const scenarioLabel: Record<DemoScenarioId, string> = { normal: 'ngÃ y thÆ°á»ng', 'rain-peak': 'mÆ°a cao Ä‘iá»ƒm', holiday: 'lá»… há»™i cuá»‘i tuáº§n' }
  const createdAt = new Date().toISOString()
  const snapshotSuffix = createdAt.replace(/\D/g, '').slice(0, 12)
  return strategies.map((strategy, index) => {
    const metrics = calculateMetrics(strategy.moves)
    const economics = calculateEconomics(strategy, metrics.expectedTrips)
    const id = `PLN-${String(startingPlanNumber + index).padStart(3, '0')}`
    return completeProposal({
      id, rootProposalId: id, parentProposalId: null, title: `${strategy.title} â€” ${scenarioLabel[scenarioId]}`, status: 'UnderReview', createdAt, version: 1, rank: index + 1,
      scenarioId, generatorType: 'AGENT', generatorVersion: 'gsm14-agent/1.4.0', inputSnapshotId: `SNP-${scenarioId}-${snapshotSuffix}`, hotspotId: `HOT-04-${snapshotSuffix}`, targetZoneId: 'AI-Z02', targetZoneLabel: 'HoÃ n Kiáº¿m 1', confidence: strategy.confidence, candidateSourceZones,
      moves: strategy.moves, simulationAvailable: true, targetDriverCount: strategy.targetDriverCount, expectedOfferCount: Math.ceil(strategy.targetDriverCount * 1.5), eligibleDriverCount: 12, averageDistanceKm: weightedAverage(strategy.moves, 'distanceKm'), averageEtaMinutes: weightedAverage(strategy.moves, 'etaMinutes'), campaignDurationMinutes: 45,
      relocationBonus: strategy.relocationBonus, zoneTripBonus: strategy.zoneTripBonus, fareMultiplier: strategy.fareMultiplier, budgetLimit: strategy.budgetLimit, ...economics,
      metricsBefore: snapshotMetrics, metrics, explanation: [`HoÃ n Kiáº¿m 1 thiáº¿u 10 xe hiá»‡n táº¡i vÃ  dá»± bÃ¡o thiáº¿u 14 xe sau 15 phÃºt trong ká»‹ch báº£n ${scenarioLabel[scenarioId]}.`, `Äiá»u ${strategy.moves.reduce((sum, relocation) => sum + relocation.quantity, 0)} xe tá»« vÃ¹ng cÃ²n dÆ°; má»—i vÃ¹ng nguá»“n váº«n giá»¯ tá»‘i thiá»ƒu 8 xe sáºµn sÃ ng.`, `Xáº¿p háº¡ng ${index + 1}/3 theo má»¥c tiÃªu â€œ${strategy.title.toLowerCase()}â€ vÃ  chi phÃ­ thÆ°á»Ÿng chá»‰ tÃ­nh trÃªn chuyáº¿n tÄƒng thÃªm.`], inputFreshUntil: freshUntil(),
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
  return completeProposal({ ...plan, ...parameters, ...economics, id: revisedId, rootProposalId: plan.rootProposalId, parentProposalId: plan.id, moves, metrics, status: 'Revised', version: plan.version + 1, createdAt: new Date().toISOString(), expectedOfferCount: Math.ceil(request.targetDriverCount * 1.5), averageDistanceKm: weightedAverage(moves, 'distanceKm'), averageEtaMinutes: weightedAverage(moves, 'etaMinutes'), inputFreshUntil: freshUntil(), explanation: [...plan.explanation.slice(0, 2), `MÃ´ phá»ng láº¡i phiÃªn báº£n ${plan.version + 1} sau chá»‰nh sá»­a: ${request.note}`] })
}

function weightedAverage(moves: readonly Move[], field: 'distanceKm' | 'etaMinutes') {
  const units = moves.reduce((sum, relocation) => sum + relocation.quantity, 0)
  if (units === 0) return 0
  return Math.round(moves.reduce((sum, relocation) => sum + relocation[field] * relocation.quantity, 0) / units * 10) / 10
}
