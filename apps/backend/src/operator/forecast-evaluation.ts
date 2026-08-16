type ForecastValue = {
  zone_id?: unknown;
  predicted_demand?: unknown;
  predicted_supply?: unknown;
  demand_p10?: unknown;
  demand_p90?: unknown;
  supply_p10?: unknown;
  supply_p90?: unknown;
}

type ObservationValue = {
  zone_id?: unknown;
  data_status?: unknown;
  demand_observed?: unknown;
  idle_supply?: unknown;
}

export type ForecastEvaluation = {
  status: 'OBSERVED';
  targetAt: string;
  evaluatedZones: number;
  demandMae: number;
  supplyMae: number;
  demandMape: number;
  demandIntervalCoverage: number;
  supplyIntervalCoverage: number;
  forecastFulfillmentRate: number;
  observedFulfillmentRate: number;
  fulfillmentRateError: number;
  forecastResidualGap: number;
  observedResidualGap: number;
}

const numberValue = (value: unknown) => Number(value)
const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const within = (value: number, lower: unknown, upper: unknown) => {
  const low = numberValue(lower)
  const high = numberValue(upper)
  return Number.isFinite(low) && Number.isFinite(high) && value >= low && value <= high
}

/** Compare one immutable forecast run with the later observed replay bucket. */
export function evaluateForecast(
  forecasts: readonly ForecastValue[],
  observations: readonly ObservationValue[],
  targetAt: string,
): ForecastEvaluation | null {
  const forecastByZone = new Map(forecasts.map((row) => [numberValue(row.zone_id), row]))
  const pairs = observations.flatMap((observation) => {
    if (observation.data_status !== 'live') return []
    const zoneId = numberValue(observation.zone_id)
    const forecast = forecastByZone.get(zoneId)
    const demand = numberValue(observation.demand_observed)
    const supply = numberValue(observation.idle_supply)
    const predictedDemand = numberValue(forecast?.predicted_demand)
    const predictedSupply = numberValue(forecast?.predicted_supply)
    return forecast && [demand, supply, predictedDemand, predictedSupply].every(Number.isFinite)
      ? [{ observation, forecast, demand, supply, predictedDemand, predictedSupply }]
      : []
  })
  if (!pairs.length) return null

  const sum = (selector: (pair: typeof pairs[number]) => number) => pairs.reduce((total, pair) => total + selector(pair), 0)
  const observedDemand = sum((pair) => pair.demand)
  const predictedDemand = sum((pair) => pair.predictedDemand)
  const observedGap = sum((pair) => Math.max(0, pair.demand - pair.supply))
  const predictedGap = sum((pair) => Math.max(0, pair.predictedDemand - pair.predictedSupply))
  const observedFulfillment = observedDemand > 0 ? (1 - observedGap / observedDemand) * 100 : 100
  const predictedFulfillment = predictedDemand > 0 ? (1 - predictedGap / predictedDemand) * 100 : 100

  return {
    status: 'OBSERVED',
    targetAt,
    evaluatedZones: pairs.length,
    demandMae: round(sum((pair) => Math.abs(pair.predictedDemand - pair.demand)) / pairs.length),
    supplyMae: round(sum((pair) => Math.abs(pair.predictedSupply - pair.supply)) / pairs.length),
    demandMape: round(sum((pair) => Math.abs(pair.predictedDemand - pair.demand) / Math.max(pair.demand, 1)) / pairs.length * 100),
    demandIntervalCoverage: round(sum((pair) => within(pair.demand, pair.forecast.demand_p10, pair.forecast.demand_p90) ? 1 : 0) / pairs.length * 100),
    supplyIntervalCoverage: round(sum((pair) => within(pair.supply, pair.forecast.supply_p10, pair.forecast.supply_p90) ? 1 : 0) / pairs.length * 100),
    forecastFulfillmentRate: round(predictedFulfillment),
    observedFulfillmentRate: round(observedFulfillment),
    fulfillmentRateError: round(Math.abs(predictedFulfillment - observedFulfillment)),
    forecastResidualGap: round(predictedGap),
    observedResidualGap: round(observedGap),
  }
}
