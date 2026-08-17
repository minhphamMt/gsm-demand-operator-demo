import { hasOperationalObservation, operationalGapFor, type Zone } from '@/features/operator-data'

const MAX_FORECAST_MINUTES = 30

export function projectZonesAtMinute(
  zones: readonly Zone[],
  minute: number,
  conservativeGap = false,
): readonly Zone[] {
  const forecastMinute = Math.min(MAX_FORECAST_MINUTES, Math.max(0, minute))

  return zones.map((zone) => {
    if (!hasOperationalObservation(zone)) {
      const { operationalGap: _operationalGap, ...missingZone } = zone
      return { ...missingZone, supply: null, demand: null, gap: null, severity: 'Unknown' }
    }
    const demand = projectDemand(zone, forecastMinute)
    const supply = projectSupply(zone, forecastMinute)
    const rainMmH = projectRain(zone, forecastMinute)
    const gapDemand = conservativeGap ? projectUpperDemand(zone, forecastMinute) : demand
    const operationalGap = operationalGapFor({ demand: gapDemand, rainMmH, supply }) ?? 0
    const gap = Math.max(0, operationalGap)

    return { ...zone, supply, demand, gap, operationalGap, rainMmH, confidence: confidenceAtMinute(zone, forecastMinute), severity: severityForGap(gap) }
  })
}

function confidenceAtMinute(zone: Zone, minute: number) {
  if (minute === 0) return zone.confidence
  if (minute <= 5) return zone.confidence5 ?? zone.confidence
  if (minute <= 15) return zone.confidence15 ?? zone.confidence
  return zone.confidence30 ?? zone.confidence
}

function projectUpperDemand(zone: Zone, minute: number) {
  if (minute === 0) return zone.demand ?? 0
  const upper5 = zone.demandRange5?.[1] ?? zone.forecast5 ?? zone.demand ?? 0
  const upper15 = zone.demandRange15?.[1] ?? zone.forecast15
  const upper30 = zone.demandRange30?.[1] ?? zone.forecast30
  if (minute <= 5) return interpolate(zone.demand ?? 0, upper5, minute / 5)
  if (minute <= 15) return interpolate(upper5, upper15, (minute - 5) / 10)
  return interpolate(upper15, upper30, (minute - 15) / 15)
}

export function forecastSteps(horizonMinutes: 15 | 30): readonly number[] {
  return Array.from({ length: horizonMinutes / 5 + 1 }, (_, index) => index * 5)
}

export function meanRainAtMinute(zones: readonly Zone[], minute: number) {
  if (!zones.length) return 0
  return zones.reduce((sum, zone) => sum + projectRain(zone, minute), 0) / zones.length
}

function projectSupply(zone: Zone, minute: number) {
  if (minute === 0) return zone.supply ?? 0
  const forecast5 = zone.forecastSupply5 ?? zone.supply ?? 0
  const forecast15 = zone.forecastSupply15 ?? zone.supply ?? 0
  const forecast30 = zone.forecastSupply30 ?? forecast15
  if (minute <= 5) return interpolate(zone.supply ?? 0, forecast5, minute / 5)
  if (minute <= 15) return interpolate(forecast5, forecast15, (minute - 5) / 10)
  return interpolate(forecast15, forecast30, (minute - 15) / 15)
}

function projectDemand(zone: Zone, minute: number) {
  if (minute === 0) return zone.demand ?? 0
  return interpolateForecast(zone, minute)
}

function projectRain(zone: Zone, minute: number) {
  if (minute === 0) return zone.rainMmH
  if (minute <= 15) return interpolateDecimal(zone.rainMmH, zone.rainForecast15, minute / 15)
  return interpolateDecimal(zone.rainForecast15, zone.rainForecast30, (minute - 15) / 15)
}

function interpolateForecast(zone: Zone, minute: number) {
  const forecast5 = zone.forecast5 ?? zone.demand ?? 0
  if (minute <= 5) return interpolate(zone.demand ?? 0, forecast5, minute / 5)
  if (minute <= 15) return interpolate(forecast5, zone.forecast15, (minute - 5) / 10)
  return interpolate(zone.forecast15, zone.forecast30, (minute - 15) / 15)
}

function interpolate(from: number, to: number, progress: number) {
  return Math.round(from + (to - from) * progress)
}

function interpolateDecimal(from: number, to: number, progress: number) {
  return Math.round((from + (to - from) * progress) * 1000) / 1000
}

function severityForGap(gap: number): Zone['severity'] {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}
