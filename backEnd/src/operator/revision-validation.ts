type RevisionMove = {
  from_h3: string;
  drivers: number;
};

type CandidateSource = {
  availableSupply: number;
  zoneId: string;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

function candidateSources(sourcePlan: unknown): CandidateSource[] {
  const candidates = record(sourcePlan)?.candidate_source_zones;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    const value = record(candidate);
    const zoneId = value?.zoneId ?? value?.zone_id ?? value?.h3_index;
    const supply = value?.availableSupply ?? value?.available_supply ?? value?.supply;
    return typeof zoneId === 'string' && Number.isFinite(Number(supply))
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
  const requestedBySource = new Map<string, number>();

  for (const move of input.moves) {
    requestedBySource.set(move.from_h3, (requestedBySource.get(move.from_h3) ?? 0) + move.drivers);
  }
  input.moves.forEach((move, index) => {
    if (candidates.size && !candidates.has(move.from_h3)) {
      errors[`sourcePlan.moves.${index}.from_h3`] = 'Vùng nguồn không thuộc danh sách ứng viên của proposal.';
      return;
    }
    const available = candidates.get(move.from_h3)?.availableSupply;
    if (available !== undefined && (requestedBySource.get(move.from_h3) ?? 0) > available) {
      errors[`sourcePlan.moves.${index}.drivers`] = `Tổng số xe lấy từ vùng nguồn không được vượt quá ${available}.`;
    }
  });

  const worstCaseCommitment = input.targetDriverCount * input.relocationBonus;
  if (input.budgetLimit < worstCaseCommitment) {
    errors.budgetLimit = `Hạn mức phải ít nhất bằng cam kết tối đa ${worstCaseCommitment} VND.`;
  }
  return errors;
}
