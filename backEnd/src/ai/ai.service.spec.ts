import { AiService } from './ai.service';

function eligibleDriverQuery(count: number) {
  const chain = {
    eq: jest.fn(),
    is: jest.fn(),
    select: jest.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: Array.from({ length: count }, (_, index) => ({ driver_id: `driver-${index + 1}` })),
      error: null,
    })),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

describe('AiService persistence', () => {
  it('persists trained forecasts and gives the proposal a non-zero offer batch', async () => {
    const proposalInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'proposal-1' }, error: null }),
      }),
    });
    const forecastUpsert = jest.fn().mockResolvedValue({ error: null });
    const outputInsert = jest.fn().mockResolvedValue({ error: null });
    const drivers = eligibleDriverQuery(3);
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'ai_zone_forecasts') return { upsert: forecastUpsert };
          if (table === 'model_outputs') return { insert: outputInsert };
          if (table === 'driver_states') return drivers;
          return { insert: proposalInsert };
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new AiService(db as never);
    const zones = Array.from({ length: 30 }, (_, index) => ({
      zone_id: index + 1,
      predicted_demand: 10,
      predicted_supply: 8,
      demand_p10: 8,
      demand_p90: 12,
      supply_p10: 6,
      supply_p90: 10,
      confidence: null,
    }));

    await (service as unknown as { persistDecision(snapshot: object, decision: object, modelInputId?: string): Promise<void> })
      .persistDecision(
        { id: 7, captured_at: '2026-08-11T21:30:00Z' },
        {
          data_source: 'supabase:ai_zone_observations:7',
          forecast_mode: 'trained_model_replay',
          activation_policy: { incentive_amount: 20_000, incentive_budget_cap: 500_000, overbooking_factor: 1.6, assumed_accept_rate: 0.6 },
          activation_recommendation: {
            target_zones: [{ zone_id: 9, gap_remaining: 4, requested_offers: 7, expected_units_gained: 4, expected_gap_remaining: 0 }],
            total_requested_offers: 7, total_expected_units_gained: 4, total_expected_gap_remaining: 0,
            projected_gap_reduction_pct: 100, worst_case_commitment: 140_000, constrained_by_budget: false, accept_rate_source: 'policy_assumption',
          },
          forecast: {
            forecast_ts: '2026-08-11T21:45:00Z',
            horizon_min: 15,
            model_version: 'lgbm_quantile_v1',
            regime: 'rain_peak',
            zones,
          },
          hotspots: {
            hotspots: [{ zone_id: 9, gap: 4 }],
            surplus_zones: [{ zone_id: 6, surplus: 8, idle_supply_current: 12 }],
          },
          plan: {
            moves: [{ from_zone: 6, to_zone: 9, units_to_move: 2 }],
            residual_gap: [{ zone_id: 9, gap_remaining: 4, suggested_activation: 5 }],
            plan_totals: { total_cost: 20_000, budget_cap: 500_000 },
            warnings: [],
          },
        },
        'model-input-1',
      );

    expect(forecastUpsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ model_version: 'lgbm_quantile_v1', forecast_mode: 'trained_model_replay' }),
    ]), { onConflict: 'snapshot_id,zone_id,horizon_min' });
    expect(proposalInsert).toHaveBeenCalledWith(expect.objectContaining({
      generator_version: 'lgbm_quantile_v1',
      target_driver_count: 2,
      offer_count: 3,
      bonus_amount: 20_000,
      estimated_cost: 60_000,
      policy_status: 'PASSED',
      target_zone_ids: [9],
      source_plan: expect.objectContaining({
        candidate_source_zones: [expect.objectContaining({
          availableSupply: 2,
          capacitySource: 'optimizer_allocation',
          idleSupplyCurrent: 12,
          modelSurplus: 8,
          zoneId: 'AI-Z06',
        })],
        moves: [expect.objectContaining({ source_supply_after: 10 })],
      }),
      simulation_details: expect.objectContaining({ eligible_driver_count: 3, scenario_id: 'rain-peak' }),
    }));
    expect(outputInsert).toHaveBeenCalledWith(expect.objectContaining({
      model_input_id: 'model-input-1',
      model_version: 'lgbm_quantile_v1',
      processing_status: 'PROPOSAL_CREATED',
      proposal_id: 'proposal-1',
    }));
    expect(db.unwrap).not.toHaveBeenCalledWith(null, null);
  });

  it('keeps an activation-only decision reviewable when no direct relocation source exists', async () => {
    const proposalInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'proposal-failed' }, error: null }),
      }),
    });
    const drivers = eligibleDriverQuery(5);
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'ai_zone_forecasts') return { upsert: jest.fn().mockResolvedValue({ error: null }) };
          if (table === 'driver_states') return drivers;
          return { insert: proposalInsert };
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new AiService(db as never);

    await (service as unknown as { persistDecision(snapshot: object, decision: object): Promise<void> })
      .persistDecision(
        { id: 8, captured_at: '2026-08-11T21:30:00Z' },
        {
          data_source: 'test', forecast_mode: 'trained_model_replay',
          activation_policy: { incentive_amount: 20_000, incentive_budget_cap: 500_000, overbooking_factor: 1.6, assumed_accept_rate: 0.6 },
          activation_recommendation: {
            target_zones: [{ zone_id: 1, gap_remaining: 3, requested_offers: 5, expected_units_gained: 3, expected_gap_remaining: 0 }],
            total_requested_offers: 5, total_expected_units_gained: 3, total_expected_gap_remaining: 0,
            projected_gap_reduction_pct: 100, worst_case_commitment: 100_000, constrained_by_budget: false, accept_rate_source: 'policy_assumption',
          },
          forecast: { forecast_ts: '2026-08-11T21:45:00Z', horizon_min: 15, model_version: 'v1', regime: 'normal', zones: [] },
          hotspots: { hotspots: Array.from({ length: 24 }, (_, index) => ({ zone_id: index + 1, gap: 3 })) },
          plan: {
            moves: [], residual_gap: [{ zone_id: 1, gap_remaining: 3, suggested_activation: 3 }],
            plan_totals: { total_cost: 0, budget_cap: 500_000 },
            warnings: [{ code: 'NO_SOLUTION', message: 'No source zone' }],
          },
        },
      );

    expect(proposalInsert).toHaveBeenCalledWith(expect.objectContaining({
      target_zone_ids: [1],
      policy_status: 'PASSED',
      bonus_amount: 20_000,
      target_driver_count: 3,
      offer_count: 5,
      estimated_cost: 100_000,
      simulation_details: expect.objectContaining({
        plan_mode: 'ACTIVATION_ONLY',
        warnings: [expect.objectContaining({ code: 'NO_RELOCATION_SOURCE' })],
      }),
    }));
  });

  it('rejects baseline fallback output for a replay-provenance snapshot', async () => {
    const zones = Array.from({ length: 30 }, (_, index) => ({
      data_status: 'live',
      demand_observed: 10,
      enroute_supply: 0,
      holiday_flag: 0,
      idle_supply: 8,
      peak_flag: 0,
      rain_forecast_15: 0,
      rain_forecast_30: 0,
      rain_mm_h: 0,
      snapshot_id: 7,
      source_name: 'AI_PARQUET_REPLAY:2026-08-11T21:30:00Z',
      zone_id: index + 1,
    }));
    const snapshot = {
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 7, captured_at: '2026-08-11T21:30:00Z' }, error: null,
      }),
      select: jest.fn(),
    };
    snapshot.eq.mockReturnValue(snapshot);
    snapshot.select.mockReturnValue(snapshot);
    const observationQuery = {
      eq: jest.fn(), order: jest.fn(), select: jest.fn(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: zones, error: null })),
    };
    observationQuery.eq.mockReturnValue(observationQuery);
    observationQuery.order.mockReturnValue(observationQuery);
    observationQuery.select.mockReturnValue(observationQuery);
    const inputSingle = jest.fn().mockResolvedValue({ data: { id: 'input-1' }, error: null });
    const inputSelect = jest.fn().mockReturnValue({ single: inputSingle });
    const inputInsert = jest.fn().mockReturnValue({ select: inputSelect });
    const inputUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const inputUpdate = jest.fn().mockReturnValue({ eq: inputUpdateEq });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'supply_demand_snapshots') return snapshot;
          if (table === 'ai_zone_observations') return observationQuery;
          if (table === 'model_inputs') return { insert: inputInsert, update: inputUpdate };
          throw new Error(`unexpected table ${table}`);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new AiService(db as never);
    jest.spyOn(service as never, 'request').mockResolvedValue({ forecast_mode: 'live_snapshot_baseline' } as never);

    await expect(service.generate(5, 7, false, false)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REPLAY_MODEL_REQUIRED' }),
    });
    expect(inputUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
  });
});
