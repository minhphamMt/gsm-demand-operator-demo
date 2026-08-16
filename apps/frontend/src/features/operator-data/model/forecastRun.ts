import type { AiSnapshotStatus, ForecastHorizon } from '@/features/operator-data/model/types'

const usableStatuses = new Set(['COMPLETED', 'FALLBACK'] as const)

function isForecastHorizon(value: number): value is ForecastHorizon {
  return value === 5 || value === 10 || value === 15
}

export function supportedForecastHorizons(
  capabilityValues: readonly number[] | undefined,
  status: AiSnapshotStatus | undefined,
): readonly ForecastHorizon[] {
  const declared = [...new Set(capabilityValues ?? [])]
    .filter(isForecastHorizon)
    .sort((left, right) => left - right)
  return declared.length ? declared : availableForecastHorizons(status)
}

export function availableForecastHorizons(status: AiSnapshotStatus | undefined): readonly ForecastHorizon[] {
  if (status?.forecastRuns) {
    return status.forecastRuns
      .filter((run) => isForecastHorizon(run.horizonMinutes) && usableStatuses.has(run.status as 'COMPLETED' | 'FALLBACK') && run.zoneCount === status.registeredZones)
      .map((run) => run.horizonMinutes)
  }
  return [...new Set(status?.horizons ?? [])].filter(isForecastHorizon)
}

export function forecastRunForHorizon(status: AiSnapshotStatus | undefined, horizon: ForecastHorizon) {
  return status?.forecastRuns?.find((run) => run.horizonMinutes === horizon)
}

export function hasExactForecastRun(status: AiSnapshotStatus | undefined, horizon: ForecastHorizon) {
  const run = forecastRunForHorizon(status, horizon)
  if (run) return usableStatuses.has(run.status as 'COMPLETED' | 'FALLBACK') && run.zoneCount === status?.registeredZones
  return Boolean(
    status?.forecastRunId
    && status.forecastStatus
    && usableStatuses.has(status.forecastStatus as 'COMPLETED' | 'FALLBACK')
    && status.horizons.includes(horizon)
    && status.forecastedZones === status.registeredZones,
  )
}
