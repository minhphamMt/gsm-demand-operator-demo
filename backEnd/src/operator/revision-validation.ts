type RevisionMove = {
  from_zone: number;
  drivers: number;
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
  const candidates = record(sourcePlan)?.candidate_source_zones;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    const value = record(candidate);
    const zoneId = zoneNumber(value?.zoneId ?? value?.zone_id);
    const supply = value?.availableSupply ?? value?.available_supply ?? value?.supply;
    return zoneId !== null && Number.isFinite(Number(supply))
      ? [{ zoneId, availableSupply: Number(supply) }]
      : [];
  });
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

  for (const move of input.moves) {
    requestedBySource.set(move.from_zone, (requestedBySource.get(move.from_zone) ?? 0) + move.drivers);
  }
  input.moves.forEach((move, index) => {
    if (candidates.size && !candidates.has(move.from_zone)) {
      errors[`sourcePlan.moves.${index}.from_zone`] = 'Zone nguồn không thuộc danh sách ứng viên của proposal.';
      return;
    }
    const available = candidates.get(move.from_zone)?.availableSupply;
    if (available !== undefined && (requestedBySource.get(move.from_zone) ?? 0) > available) {
      errors[`sourcePlan.moves.${index}.drivers`] = `Tổng số xe lấy từ zone nguồn không được vượt quá ${available}.`;
    }
  });

  const worstCaseCommitment = input.targetDriverCount * input.relocationBonus;
  if (input.budgetLimit < worstCaseCommitment) {
    errors.budgetLimit = `Hạn mức phải ít nhất bằng cam kết tối đa ${worstCaseCommitment} VND.`;
  }
  return errors;
}
