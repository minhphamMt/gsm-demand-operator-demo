export type HotspotSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export type HotspotInput = {
  demand: number | null;
  forecastRunId?: string | undefined;
  previousSeverity?: HotspotSeverity | undefined;
  supply: number | null;
  zoneId: string;
};

export type DerivedHotspot = {
  contributingFeatures: { demand: number; gap: number; supply: number };
  forecastRunId?: string | undefined;
  isPersistent: boolean;
  policyVersion: string;
  rank: number;
  reasonCodes: readonly ('HIGH_DEMAND_GAP' | 'SUPPLY_SHORTAGE')[];
  severity: HotspotSeverity;
  threshold: number;
  zoneId: string;
};

export const hotspotPolicy = {
  version: 'hotspot-gap-v1',
  enter: { medium: 3, high: 6, critical: 11 },
  exit: { medium: 1, high: 4, critical: 9 },
} as const;

function severityForGap(gap: number, previousSeverity?: HotspotSeverity): HotspotSeverity {
  if (previousSeverity === 'Critical' && gap >= hotspotPolicy.exit.critical) return 'Critical';
  if (previousSeverity === 'High' && gap >= hotspotPolicy.exit.high) return 'High';
  if (previousSeverity === 'Medium' && gap >= hotspotPolicy.exit.medium) return 'Medium';
  if (gap >= hotspotPolicy.enter.critical) return 'Critical';
  if (gap >= hotspotPolicy.enter.high) return 'High';
  if (gap >= hotspotPolicy.enter.medium) return 'Medium';
  return 'Low';
}

function thresholdForSeverity(severity: HotspotSeverity, previousSeverity?: HotspotSeverity): number {
  if (severity === 'Critical') {
    return previousSeverity === 'Critical' ? hotspotPolicy.exit.critical : hotspotPolicy.enter.critical;
  }
  if (severity === 'High') {
    return previousSeverity === 'High' ? hotspotPolicy.exit.high : hotspotPolicy.enter.high;
  }
  return previousSeverity === 'Medium' ? hotspotPolicy.exit.medium : hotspotPolicy.enter.medium;
}

export function deriveHotspots(inputs: readonly HotspotInput[]): readonly DerivedHotspot[] {
  return inputs.flatMap((input) => {
    if (input.demand === null || input.supply === null) return [];
    const gap = Math.max(0, input.demand - input.supply);
    const severity = severityForGap(gap, input.previousSeverity);
    if (severity === 'Low' || severity === 'Medium') return [];
    const reasonCodes = [
      ...(gap >= hotspotPolicy.enter.high ? ['HIGH_DEMAND_GAP' as const] : []),
      ...(input.supply <= 3 ? ['SUPPLY_SHORTAGE' as const] : []),
    ];
    return [{
      zoneId: input.zoneId,
      forecastRunId: input.forecastRunId,
      severity,
      policyVersion: hotspotPolicy.version,
      isPersistent: input.previousSeverity === severity,
      reasonCodes,
      threshold: thresholdForSeverity(severity, input.previousSeverity),
      contributingFeatures: { demand: input.demand, supply: input.supply, gap },
      rank: 0,
    }];
  }).sort((left, right) => (
    right.contributingFeatures.gap - left.contributingFeatures.gap
    || left.zoneId.localeCompare(right.zoneId)
  )).map((hotspot, index) => ({ ...hotspot, rank: index + 1 }));
}
