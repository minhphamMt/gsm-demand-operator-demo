import { evaluateForecast } from './forecast-evaluation'

describe('evaluateForecast', () => {
  it('compares per-zone predictions with later live observations', () => {
    const result = evaluateForecast([
      { zone_id: 1, predicted_demand: 10, predicted_supply: 8, demand_p10: 8, demand_p90: 12, supply_p10: 7, supply_p90: 9 },
      { zone_id: 2, predicted_demand: 6, predicted_supply: 7, demand_p10: 5, demand_p90: 7, supply_p10: 6, supply_p90: 8 },
    ], [
      { zone_id: 1, data_status: 'live', demand_observed: 12, idle_supply: 9 },
      { zone_id: 2, data_status: 'live', demand_observed: 5, idle_supply: 6 },
    ], '2026-09-25T01:10:00.000Z')

    expect(result).toMatchObject({
      status: 'OBSERVED',
      evaluatedZones: 2,
      demandMae: 1.5,
      supplyMae: 1,
      demandIntervalCoverage: 100,
      supplyIntervalCoverage: 100,
      forecastResidualGap: 2,
      observedResidualGap: 3,
    })
  })

  it('ignores missing zones and returns null without comparable data', () => {
    expect(evaluateForecast(
      [{ zone_id: 1, predicted_demand: 10, predicted_supply: 8 }],
      [{ zone_id: 1, data_status: 'missing', demand_observed: null, idle_supply: null }],
      '2026-09-25T01:10:00.000Z',
    )).toBeNull()
  })
})
