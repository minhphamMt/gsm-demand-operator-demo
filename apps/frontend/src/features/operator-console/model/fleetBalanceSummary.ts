import { hasOperationalObservation, operationalGapFor, type Zone } from '@/features/operator-data'

export type FleetBalanceSummary = {
  medianDeficit: number
  riskAdjustedDeficit: number
  riskBuffer: number
  forecastSurplus: number
  safeDispatchable: number
}

export function fleetBalanceSummary(zones: readonly Zone[]): FleetBalanceSummary {
  const totals = zones.filter(hasOperationalObservation).reduce((summary, zone) => {
    const medianGap = operationalGapFor(zone) ?? 0
    const riskAdjustedGap = zone.operationalGap ?? medianGap
    return {
      medianDeficit: summary.medianDeficit + Math.max(0, medianGap),
      riskAdjustedDeficit: summary.riskAdjustedDeficit + Math.max(0, riskAdjustedGap),
      forecastSurplus: summary.forecastSurplus + Math.max(0, -medianGap),
      safeDispatchable: summary.safeDispatchable + Math.max(0, -riskAdjustedGap),
    }
  }, { medianDeficit: 0, riskAdjustedDeficit: 0, forecastSurplus: 0, safeDispatchable: 0 })

  return {
    ...totals,
    riskBuffer: Math.max(0, totals.riskAdjustedDeficit - totals.medianDeficit),
  }
}
