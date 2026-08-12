type RevisionMove = {
  drivers: number;
  from_zone: number;
  id?: string;
  to_zone: number;
};

type Row = Record<string, unknown>;
type RevisedSourcePlan = Row & { moves: Row[]; plan_totals: Row; residual_gap: Row[] };

const record = (value: unknown): Row | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : undefined;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const units = (move: Row) => number(move.drivers ?? move.units_to_move ?? move.quantity);
const zone = (value: unknown) => number(String(value ?? '').replace(/^AI-Z/i, ''));

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.flatMap((item): Row[] => {
    const parsed = record(item);
    return parsed ? [parsed] : [];
  }) : [];
}

function withoutDerivedMoveEvidence(move: Row): Row {
  const {
    after_gap: _afterGap,
    before_gap: _beforeGap,
    source_supply_after: _sourceSupplyAfter,
    sourceSupplyAfter: _sourceSupplyAfterCamel,
    ...evidence
  } = move;
  return evidence;
}

export function buildRevisedSourcePlan(
  currentSourcePlan: unknown,
  requestedMoves: readonly RevisionMove[],
  budgetLimit?: number,
): RevisedSourcePlan {
  const current = record(currentSourcePlan) ?? {};
  const currentMoves = rows(current.moves);
  const currentResidual = rows(current.residual_gap);
  const targetBaseline = new Map<number, number>();
  const sourceInitialSupply = new Map<number, number>();
  const originalWithdrawn = new Map<number, number>();

  for (const move of currentMoves) {
    const target = zone(move.to_zone ?? move.targetZoneId);
    const source = zone(move.from_zone ?? move.sourceZoneId);
    const quantity = units(move);
    targetBaseline.set(target, (targetBaseline.get(target) ?? 0) + quantity);
    const cumulative = (originalWithdrawn.get(source) ?? 0) + quantity;
    originalWithdrawn.set(source, cumulative);
    const sourceAfterRaw = move.source_supply_after ?? move.sourceSupplyAfter;
    if (sourceAfterRaw !== null && sourceAfterRaw !== undefined && Number.isFinite(Number(sourceAfterRaw))) {
      sourceInitialSupply.set(source, number(sourceAfterRaw) + cumulative);
    }
  }
  for (const residual of currentResidual) {
    const target = zone(residual.zone_id ?? residual.zoneId);
    targetBaseline.set(target, (targetBaseline.get(target) ?? 0)
      + number(residual.gap_remaining ?? residual.gapRemaining));
  }
  for (const candidate of rows(current.candidate_source_zones)) {
    const source = zone(candidate.zoneId ?? candidate.zone_id);
    const idleRaw = candidate.idleSupplyCurrent ?? candidate.idle_supply_current;
    if (idleRaw !== null && idleRaw !== undefined && Number.isFinite(Number(idleRaw))) {
      sourceInitialSupply.set(source, number(idleRaw));
    }
  }

  const remainingByTarget = new Map(targetBaseline);
  const withdrawnBySource = new Map<number, number>();
  const revisedMoves = requestedMoves.filter((move) => move.drivers > 0).map((move): Row => {
    const original = currentMoves.find((candidate) => candidate.id === move.id)
      ?? currentMoves.find((candidate) =>
        zone(candidate.from_zone ?? candidate.sourceZoneId) === move.from_zone
        && zone(candidate.to_zone ?? candidate.targetZoneId) === move.to_zone);
    const beforeGap = remainingByTarget.get(move.to_zone) ?? number(original?.before_gap);
    const afterGap = Math.max(0, beforeGap - move.drivers);
    remainingByTarget.set(move.to_zone, afterGap);
    const withdrawn = (withdrawnBySource.get(move.from_zone) ?? 0) + move.drivers;
    withdrawnBySource.set(move.from_zone, withdrawn);
    const initialSourceSupply = sourceInitialSupply.get(move.from_zone);
    return {
      ...withoutDerivedMoveEvidence(original ?? {}),
      ...(move.id ? { id: move.id } : {}),
      after_gap: afterGap,
      before_gap: beforeGap,
      drivers: move.drivers,
      from_zone: move.from_zone,
      ...(initialSourceSupply === undefined
        ? {}
        : { source_supply_after: Math.max(0, initialSourceSupply - withdrawn) }),
      to_zone: move.to_zone,
      units_to_move: move.drivers,
    };
  });

  const residualGap = [...targetBaseline.entries()].flatMap(([target, baseline]) => {
    const remaining = Math.max(0, baseline - (targetBaseline.get(target)! - (remainingByTarget.get(target) ?? baseline)));
    return remaining > 0
      ? [{ zone_id: target, gap_remaining: remaining, suggested_activation: Math.ceil(remaining) }]
      : [];
  });
  const totalResidual = residualGap.reduce((sum, residual) => sum + number(residual.gap_remaining), 0);
  const currentWarnings = rows(current.warnings).filter((warning) =>
    !['NO_SOLUTION', 'PLAN_NOT_FULLY_COVERING_GAP'].includes(String(warning.code ?? '')));
  const warnings = totalResidual > 0
    ? [...currentWarnings, {
        code: 'PLAN_NOT_FULLY_COVERING_GAP',
        message: `Còn ${totalResidual} xe chưa được phủ sau điều chỉnh.`,
        severity: 'warning',
      }]
    : currentWarnings;
  const planTotals = record(current.plan_totals) ?? {};

  return {
    ...current,
    moves: revisedMoves,
    residual_gap: residualGap,
    warnings,
    plan_totals: {
      ...planTotals,
      ...(budgetLimit === undefined ? {} : { budget_cap: budgetLimit }),
      total_cost: revisedMoves.reduce((sum, move) => sum + number(move.estimated_cost), 0),
      total_deadhead_km: revisedMoves.reduce(
        (sum, move) => sum + number(move.deadhead_km ?? move.estimated_distance_km), 0),
      total_units: revisedMoves.reduce((sum, move) => sum + units(move), 0),
    },
  };
}
