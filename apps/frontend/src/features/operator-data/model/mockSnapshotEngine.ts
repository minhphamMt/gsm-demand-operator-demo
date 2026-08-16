import { hasOperationalObservation } from '@/features/operator-data/model/zoneBalance'
import type { Scenario, Snapshot, Zone } from '@/features/operator-data/model/types'

type SnapshotSimulationInput = {
  comparison: Scenario
  gain: number
  regime: Snapshot['regime']
  replayIndex: number
}

export function simulateSnapshot(baseZones: readonly Zone[], input: SnapshotSimulationInput) {
  const demandFactor = input.regime === 'rain_peak' ? 1 : input.regime === 'peak' ? 0.94 : 0.82
  const responseRatio = input.comparison === 'baseline' ? 0 : input.comparison === 'plan' ? 0.35 : 0.35 + Math.min(0.25, input.gain * 0.04)
  const replayMinute = Math.min(30, input.replayIndex * 5)
  const zones = baseZones.map((zone) => projectZone(zone, demandFactor, replayMinute, responseRatio))
  const hotspots = zones.filter((zone) => typeof zone.gap === 'number' && zone.gap > 5).sort((left, right) => (right.gap ?? 0) - (left.gap ?? 0)).slice(0, 3).map((zone, index) => {
    const change = zone.forecast15 - (zone.demand ?? 0)
    const trend = change > 0 ? `tăng ${change} xe` : change < 0 ? `giảm ${Math.abs(change)} xe` : 'ổn định'
    return { zoneId: zone.id, rank: index + 1, reason: `Thiếu ${zone.gap} xe; 15 phút tới ${trend}.`, etaMinutes: 9 + index * 3, isPersistent: input.replayIndex > 1 }
  })
  const requests = zones.reduce((sum, zone) => sum + (zone.demand ?? 0), 0)
  const fulfilled = zones.reduce((sum, zone) => sum + Math.min(zone.supply ?? 0, zone.demand ?? 0), 0)
  const residualGap = zones.reduce((sum, zone) => sum + Math.max(0, zone.gap ?? 0), 0)

  return {
    zones,
    hotspots,
    kpis: {
      fleetAvailable: zones.reduce((sum, zone) => sum + (zone.supply ?? 0), 0),
      requests,
      fulfillmentRate: Math.round(fulfilled / requests * 1_000) / 10,
      residualGap,
      avgWaitProxy: Math.round((5.4 + residualGap / requests * 20) * 10) / 10,
    },
  } satisfies Pick<Snapshot, 'zones' | 'hotspots' | 'kpis'>
}

function projectZone(zone: Zone, demandFactor: number, minute: number, responseRatio: number): Zone {
  if (!hasOperationalObservation(zone)) {
    const { operationalGap: _operationalGap, ...missingZone } = zone
    return { ...missingZone, supply: null, demand: null, gap: null, severity: 'Unknown' }
  }
  const demand = Math.round(interpolateForecast(zone, minute) * demandFactor)
  const rawGap = demand - zone.supply
  const supply = zone.supply + (rawGap > 0 ? Math.round(rawGap * responseRatio) : 0)
  const gap = demand - supply

  return { ...zone, supply, demand, gap, forecast15: Math.round(zone.forecast15 * demandFactor), forecast30: Math.round(zone.forecast30 * demandFactor), severity: severityForGap(gap) }
}

function interpolateForecast(zone: Zone, minute: number) {
  if (minute <= 15) return interpolate(zone.demand ?? 0, zone.forecast15, minute / 15)
  return interpolate(zone.forecast15, zone.forecast30, (minute - 15) / 15)
}

function interpolate(from: number, to: number, progress: number) {
  return Math.round(from + (to - from) * progress)
}

function severityForGap(gap: number): Zone['severity'] {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}
