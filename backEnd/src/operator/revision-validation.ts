type RevisionMove = {
  from_zone: number;
  drivers: number;
  id?: string;
  to_zone: number;
};

type CandidateSource = {
  availableSupply: number;
  zoneId: number;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const zoneNumber = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.replace(/^AI-Z/i, '') : value;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : null;
};

function candidateSources(sourcePlan: unknown): CandidateSource[] {
  const source = record(sourcePlan);
  const candidates = source?.candidate_source_zones;
  const parsed = Array.isArray(candidates) ? candidates.flatMap((candidate) => {
    const value = record(candidate);
    const zoneId = zoneNumber(value?.zoneId ?? value?.zone_id);
    const supply = value?.availableSupply ?? value?.available_supply ?? value?.supply;
    return zoneId !== null && Number.isFinite(Number(supply))
      ? [{ zoneId, availableSupply: Number(supply) }]
      : [];
  }) : [];
  if (parsed.length) return parsed;

  const allocated = new Map<number, number>();
  const moves = source?.moves;
  if (!Array.isArray(moves)) return [];
  for (const move of moves) {
    const value = record(move);
    const zoneId = zoneNumber(value?.from_zone ?? value?.sourceZoneId);
    const units = Number(value?.drivers ?? value?.units_to_move ?? value?.quantity);
    if (zoneId !== null && Number.isFinite(units)) allocated.set(zoneId, (allocated.get(zoneId) ?? 0) + units);
  }
  return [...allocated].map(([zoneId, availableSupply]) => ({ zoneId, availableSupply }));
}

function routeKey(fromZone: unknown, toZone: unknown) {
  const from = zoneNumber(fromZone);
  const to = zoneNumber(toZone);
  return from === null || to === null ? null : `${from}->${to}`;
}

export function revisionFieldErrors(input: {
  budgetLimit: number;
  currentSourcePlan: unknown;
  moves: readonly RevisionMove[];
  relocationBonus: number;
  targetDriverCount: number;
}) {
  const errors: Record<string, string> = {};
  const candidates = new Map(candidateSources(input.currentSourcePlan).map((source) => [source.zoneId, source]));
  const requestedBySource = new Map<number, number>();
  const source = record(input.currentSourcePlan);
  const currentMoves = Array.isArray(source?.moves) ? source.moves.flatMap((move) => {
    const value = record(move);
    const key = routeKey(value?.from_zone ?? value?.sourceZoneId, value?.to_zone ?? value?.targetZoneId);
    return value && key ? [{ id: typeof value.id === 'string' ? value.id : undefined, key }] : [];
  }) : [];
  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();

  for (const move of input.moves) {
    requestedBySource.set(move.from_zone, (requestedBySource.get(move.from_zone) ?? 0) + move.drivers);
  }
  input.moves.forEach((move, index) => {
    const key = routeKey(move.from_zone, move.to_zone);
    const matchesOriginal = currentMoves.some((current) =>
      (move.id && current.id === move.id) || current.key === key);
    if (!key || !matchesOriginal) {
      errors[`sourcePlan.moves.${index}.to_zone`] = 'Lượt điều chuyển phải thuộc đúng tuyến do model đề xuất.';
      return;
    }
    if ((move.id && seenIds.has(move.id)) || seenRoutes.has(key)) {
      errors[`sourcePlan.moves.${index}.to_zone`] = 'Không được gửi trùng một lượt điều chuyển.';
      return;
    }
    if (move.id) seenIds.add(move.id);
    seenRoutes.add(key);
    if (candidates.size && !candidates.has(move.from_zone)) {
      errors[`sourcePlan.moves.${index}.from_zone`] = 'Zone nguồn không thuộc danh sách ứng viên của proposal.';
      return;
    }
    const available = candidates.get(move.from_zone)?.availableSupply;
    if (available !== undefined && (requestedBySource.get(move.from_zone) ?? 0) > available) {
      errors[`sourcePlan.moves.${index}.drivers`] = `Tổng số xe lấy từ zone nguồn không được vượt quá ${available}.`;
    }
  });

  const originalMoves = Array.isArray(source?.moves) ? source.moves.flatMap((move) => {
    const value = record(move);
    return value ? [value] : [];
  }) : [];
  const relocationCost = input.moves.reduce((sum, move) => {
    if (move.drivers <= 0) return sum;
    const original = originalMoves.find((candidate) =>
      (move.id && candidate.id === move.id)
      || routeKey(candidate.from_zone ?? candidate.sourceZoneId, candidate.to_zone ?? candidate.targetZoneId)
        === routeKey(move.from_zone, move.to_zone));
    return sum + Number(original?.estimated_cost ?? original?.estimatedCost ?? 0);
  }, 0);
  if (input.budgetLimit < relocationCost) {
    errors.budgetLimit = `Hạn mức điều chuyển phải ít nhất bằng chi phí model ${relocationCost} VND.`;
  }
  return errors;
}
