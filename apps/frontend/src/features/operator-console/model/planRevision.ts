import type { Proposal, RevisePlanRequest } from '@/features/operator-data'

export type MoveQuantities = Readonly<Record<string, number>>

export function initialMoveQuantities(plan: Proposal): MoveQuantities {
  return Object.fromEntries(plan.moves.map((move) => [move.id, move.quantity]))
}

export function moveQuantityLimit(plan: Proposal, quantities: MoveQuantities, moveId: string) {
  const move = plan.moves.find((candidate) => candidate.id === moveId)
  if (!move) return 0
  const originalAllocated = plan.moves
    .filter((candidate) => candidate.sourceZoneId === move.sourceZoneId)
    .reduce((sum, candidate) => sum + candidate.quantity, 0)
  const declaredCapacity = plan.candidateSourceZones.find((candidate) => candidate.zoneId === move.sourceZoneId)?.availableSupply
  const sourceCapacity = Math.max(originalAllocated, declaredCapacity ?? 0)
  const assignedElsewhere = plan.moves
    .filter((candidate) => candidate.id !== moveId && candidate.sourceZoneId === move.sourceZoneId)
    .reduce((sum, candidate) => sum + (quantities[candidate.id] ?? candidate.quantity), 0)
  return Math.max(0, Math.floor(sourceCapacity - assignedElsewhere))
}

export function previewPlanRevision(plan: Proposal, quantities: MoveQuantities) {
  const assigned = plan.moves.reduce((sum, move) => sum + (quantities[move.id] ?? move.quantity), 0)
  const residualGap = Math.max(0, plan.metricsBefore.residualGap - assigned)
  const coverage = Math.max(0, Math.round((1 - residualGap / Math.max(1, plan.metricsBefore.residualGap)) * 100))
  const estimatedCost = plan.moves.reduce((sum, move) => sum + ((quantities[move.id] ?? move.quantity) > 0 ? move.estimatedCost : 0), 0)
  const activeMoves = plan.moves.filter((move) => (quantities[move.id] ?? move.quantity) > 0).length
  const hasChanges = plan.moves.some((move) => (quantities[move.id] ?? move.quantity) !== move.quantity)
  const impliedDemand = plan.metricsBefore.fulfillmentRate < 100
    ? plan.metricsBefore.residualGap / Math.max(0.0001, 1 - plan.metricsBefore.fulfillmentRate / 100)
    : 0
  const fulfillmentRate = impliedDemand > 0 ? Math.max(0, (1 - residualGap / impliedDemand) * 100) : 100
  return { activeMoves, assigned, coverage, estimatedCost, fulfillmentRate, hasChanges, residualGap }
}

export function createRevisionRequest(plan: Proposal, quantities: MoveQuantities): RevisePlanRequest {
  const changes = plan.moves
    .filter((move) => (quantities[move.id] ?? move.quantity) !== move.quantity)
    .map((move) => `${move.sourceZoneLabel}→${move.targetZoneLabel}: ${move.quantity}→${quantities[move.id] ?? move.quantity}`)
  return {
    expectedVersion: plan.version,
    moveQuantities: quantities,
    moveSourceZoneIds: Object.fromEntries(plan.moves.map((move) => [move.id, move.sourceZoneId])),
    targetDriverCount: plan.targetDriverCount,
    campaignDurationMinutes: plan.campaignDurationMinutes,
    relocationBonus: plan.relocationBonus,
    zoneTripBonus: plan.zoneTripBonus,
    fareMultiplier: plan.fareMultiplier,
    budgetLimit: plan.budgetLimit,
    note: `Điều chỉnh số xe tại bảng chỉ huy: ${changes.join('; ')}`,
  }
}
