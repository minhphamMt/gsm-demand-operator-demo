type ZoneObservationRow = {
  data_status?: unknown;
  demand_observed?: unknown;
  idle_supply?: unknown;
  rain_forecast_15?: unknown;
  rain_forecast_30?: unknown;
  rain_mm_h?: unknown;
}

export type SnapshotKpis = {
  avgWaitProxy: number;
  fleetAvailable: number;
  fulfillmentRate: number;
  requests: number;
  residualGap: number;
}

type AiZoneRow = {
  area_km2?: unknown;
  center_geojson?: { coordinates?: unknown } | null;
  service_area_geojson?: { coordinates?: unknown } | null;
  tier?: unknown;
  zone_code?: unknown;
  zone_id?: unknown;
  zone_name?: unknown;
}

type AiForecastRow = {
  confidence?: unknown;
  demand_p10?: unknown;
  demand_p90?: unknown;
  predicted_demand?: unknown;
  predicted_supply?: unknown;
  supply_p10?: unknown;
  supply_p90?: unknown;
}

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

/**
 * Mirrors apps/ai/src/simulation/metrics.py for the operational snapshot read model.
 * Supply surplus in one zone must never erase unmet demand in another zone.
 */
export function calculateSnapshotKpis(observations: readonly ZoneObservationRow[]): SnapshotKpis {
  let fleetAvailable = 0
  let requests = 0
  let residualGap = 0
  let weightedWait = 0

  for (const observation of observations) {
    if (observation.data_status !== 'live') continue
    const demand = Math.max(0, numeric(observation.demand_observed))
    const supply = Math.max(0, numeric(observation.idle_supply))
    const zoneGap = Math.max(0, demand - supply)
    const demandSupplyRatio = demand / Math.max(supply, 1)
    const wait = 3 * demandSupplyRatio ** 1.5
    fleetAvailable += supply
    requests += demand
    residualGap += zoneGap
    weightedWait += wait * demand
  }

  return {
    avgWaitProxy: requests > 0 ? weightedWait / requests : 0,
    fleetAvailable,
    fulfillmentRate: requests > 0
      ? Math.max(0, Math.min(100, (1 - residualGap / requests) * 100))
      : 100,
    requests,
    residualGap,
  }
}

export function mapAiZone(
  zone: AiZoneRow,
  observation?: ZoneObservationRow,
  forecasts?: { horizon5?: AiForecastRow; horizon10?: AiForecastRow; horizon15?: AiForecastRow },
) {
  const hasLiveData = observation?.data_status === 'live'
  // A missing observation is an unknown value, not a zero-value operational fact.
  // Keeping it nullable prevents downstream consumers from treating an unavailable
  // zone as balanced or as an empty source of vehicles.
  const supply = hasLiveData ? numeric(observation.idle_supply) : null
  const demand = hasLiveData ? numeric(observation.demand_observed) : null
  const forecast5 = numeric(forecasts?.horizon5?.predicted_demand ?? demand)
  const forecast10 = numeric(forecasts?.horizon10?.predicted_demand ?? forecast5)
  const forecast15 = numeric(forecasts?.horizon15?.predicted_demand ?? demand)
  const forecast30 = forecast15
  const forecastSupply5 = numeric(forecasts?.horizon5?.predicted_supply ?? supply)
  const forecastSupply10 = numeric(forecasts?.horizon10?.predicted_supply ?? forecastSupply5)
  const forecastSupply15 = numeric(forecasts?.horizon15?.predicted_supply ?? supply)
  const forecastSupply30 = forecastSupply15
  const activeForecast = forecasts?.horizon5 ?? forecasts?.horizon10 ?? forecasts?.horizon15
  const gap = demand === null || supply === null ? null : Math.max(0, demand - supply)
  const zoneId = numeric(zone.zone_id)
  const zoneCode = String(zone.zone_code ?? `AI-Z${String(zoneId).padStart(2, '0')}`)

  return {
    id: zoneCode,
    aiZoneId: zoneId,
    zoneCode,
    label: String(zone.zone_name ?? zoneCode),
    tier: String(zone.tier ?? 'outer'),
    areaKm2: numeric(zone.area_km2),
    center: Array.isArray(zone.center_geojson?.coordinates) ? zone.center_geojson.coordinates : null,
    boundary: Array.isArray(zone.service_area_geojson?.coordinates)
      && Array.isArray(zone.service_area_geojson.coordinates[0]) ? zone.service_area_geojson.coordinates[0] : [],
    dataStatus: hasLiveData ? 'live' : 'missing',
    supply,
    demand,
    gap,
    severity: gap === null ? 'Unknown' : severityForGap(gap),
    confidence: activeForecast?.confidence === null || activeForecast?.confidence === undefined
      ? null
      : numeric(activeForecast.confidence) * 100,
    confidence5: forecasts?.horizon5?.confidence === null || forecasts?.horizon5?.confidence === undefined ? null : numeric(forecasts.horizon5.confidence) * 100,
    confidence10: forecasts?.horizon10?.confidence === null || forecasts?.horizon10?.confidence === undefined ? null : numeric(forecasts.horizon10.confidence) * 100,
    confidence15: forecasts?.horizon15?.confidence === null || forecasts?.horizon15?.confidence === undefined ? null : numeric(forecasts.horizon15.confidence) * 100,
    confidence30: null,
    rainMmH: hasLiveData ? numeric(observation.rain_mm_h) : 0,
    rainForecast15: hasLiveData ? numeric(observation.rain_forecast_15) : 0,
    rainForecast30: hasLiveData ? numeric(observation.rain_forecast_30) : 0,
    forecast5,
    forecast10,
    forecast15,
    forecast30,
    forecastSupply5,
    forecastSupply10,
    forecastSupply15,
    forecastSupply30,
    demandRange5: forecasts?.horizon5 ? [numeric(forecasts.horizon5.demand_p10), numeric(forecasts.horizon5.demand_p90)] : null,
    demandRange10: forecasts?.horizon10 ? [numeric(forecasts.horizon10.demand_p10), numeric(forecasts.horizon10.demand_p90)] : null,
    demandRange15: forecasts?.horizon15 ? [numeric(forecasts.horizon15.demand_p10), numeric(forecasts.horizon15.demand_p90)] : null,
    demandRange30: null,
    supplyRange5: forecasts?.horizon5 ? [numeric(forecasts.horizon5.supply_p10), numeric(forecasts.horizon5.supply_p90)] : null,
    supplyRange10: forecasts?.horizon10 ? [numeric(forecasts.horizon10.supply_p10), numeric(forecasts.horizon10.supply_p90)] : null,
    supplyRange15: forecasts?.horizon15 ? [numeric(forecasts.horizon15.supply_p10), numeric(forecasts.horizon15.supply_p90)] : null,
    supplyRange30: null,
  }
}

function severityForGap(gap: number) {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}
