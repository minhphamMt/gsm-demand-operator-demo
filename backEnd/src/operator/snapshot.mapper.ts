type ZoneObservationRow = {
  data_status?: unknown;
  demand_observed?: unknown;
  idle_supply?: unknown;
}

type AiZoneRow = {
  center_geojson?: { coordinates?: unknown } | null;
  service_area_geojson?: { coordinates?: unknown } | null;
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

export function mapAiZone(
  zone: AiZoneRow,
  observation?: ZoneObservationRow,
  forecasts?: { horizon15?: AiForecastRow; horizon30?: AiForecastRow },
) {
  const hasLiveData = observation?.data_status === 'live'
  const supply = hasLiveData ? numeric(observation.idle_supply) : 0
  const demand = hasLiveData ? numeric(observation.demand_observed) : 0
  const forecast15 = numeric(forecasts?.horizon15?.predicted_demand ?? demand)
  const forecast30 = numeric(forecasts?.horizon30?.predicted_demand ?? forecast15)
  const forecastSupply15 = numeric(forecasts?.horizon15?.predicted_supply ?? supply)
  const forecastSupply30 = numeric(forecasts?.horizon30?.predicted_supply ?? forecastSupply15)
  const gap = Math.max(0, demand - supply)
  const zoneId = numeric(zone.zone_id)
  const zoneCode = String(zone.zone_code ?? `AI-Z${String(zoneId).padStart(2, '0')}`)

  return {
    id: zoneCode,
    aiZoneId: zoneId,
    zoneCode,
    label: String(zone.zone_name ?? zoneCode),
    center: Array.isArray(zone.center_geojson?.coordinates) ? zone.center_geojson.coordinates : null,
    boundary: Array.isArray(zone.service_area_geojson?.coordinates)
      && Array.isArray(zone.service_area_geojson.coordinates[0]) ? zone.service_area_geojson.coordinates[0] : [],
    dataStatus: hasLiveData ? 'live' : 'missing',
    supply,
    demand,
    gap,
    severity: severityForGap(gap),
    confidence: forecasts?.horizon15?.confidence === null || forecasts?.horizon15?.confidence === undefined
      ? null
      : numeric(forecasts.horizon15.confidence) * 100,
    forecast15,
    forecast30,
    forecastSupply15,
    forecastSupply30,
    demandRange15: forecasts?.horizon15 ? [numeric(forecasts.horizon15.demand_p10), numeric(forecasts.horizon15.demand_p90)] : null,
    demandRange30: forecasts?.horizon30 ? [numeric(forecasts.horizon30.demand_p10), numeric(forecasts.horizon30.demand_p90)] : null,
    supplyRange15: forecasts?.horizon15 ? [numeric(forecasts.horizon15.supply_p10), numeric(forecasts.horizon15.supply_p90)] : null,
    supplyRange30: forecasts?.horizon30 ? [numeric(forecasts.horizon30.supply_p10), numeric(forecasts.horizon30.supply_p90)] : null,
  }
}

function severityForGap(gap: number) {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}
