import type { Zone } from '@/features/operator-data'

const MAX_FORECAST_MINUTES = 30

export function projectZonesAtMinute(zones: readonly Zone[], minute: number): readonly Zone[] {
  const forecastMinute = Math.min(MAX_FORECAST_MINUTES, Math.max(0, minute))

  return zones.map((zone) => {
    const demand = projectDemand(zone, forecastMinute)
    const gap = Math.max(0, demand - zone.supply)

    return { ...zone, demand, gap, severity: severityForGap(gap) }
  })
}

function projectDemand(zone: Zone, minute: number) {
  if (minute === 0) return zone.demand
  return interpolateForecast(zone, minute)
}

function interpolateForecast(zone: Zone, minute: number) {
  if (minute <= 15) return interpolate(zone.demand, zone.forecast15, minute / 15)
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
