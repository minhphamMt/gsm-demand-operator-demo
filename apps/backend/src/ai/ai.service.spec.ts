import { AiService, replaySourceAtIso } from './ai.service';

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
  it('normalizes replay source time to a five-minute UTC identity', () => {
    expect(replaySourceAtIso('2026-09-25T08:35:00+07:00')).toBe('2026-09-25T01:35:00.000Z');
    expect(() => replaySourceAtIso('2026-09-25T08:36:00+07:00')).toThrow('Replay source timestamp');
    expect(() => replaySourceAtIso('invalid')).toThrow('Replay source timestamp');
  });

  it('loads an exact replay observation without running a forecast', async () => {
    const service = new AiService({} as never);
    const sourceAt = '2026-08-11T21:30:00Z';
    const dataset = { dataset: 'project', source_at: sourceAt, regime: 'rain_peak', zones: [] };
    jest.spyOn(service as never, 'request').mockResolvedValue(dataset as never);
    jest.spyOn(service as never, 'ingestExact').mockResolvedValue({ id: 42 } as never);
    const generate = jest.spyOn(service, 'generate');

    await expect(service.runReplay(sourceAt)).resolves.toEqual({ snapshot: { id: 42 } });

    expect(generate).not.toHaveBeenCalled();
  });

  it('persists only the forecast when policy hotspots are absent', async () => {
    const snapshotQuery = {
      eq: jest.fn(), order: jest.fn(), limit: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 7, captured_at: '2026-08-15T00:00:00.000Z' }, error: null,
      }),
    };
    snapshotQuery.eq.mockReturnValue(snapshotQuery);
    snapshotQuery.order.mockReturnValue(snapshotQuery);
    snapshotQuery.limit.mockReturnValue(snapshotQuery);
    const observationQuery = {
      eq: jest.fn(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    observationQuery.eq.mockReturnValue(observationQuery);
    const modelInputSingle = jest.fn().mockResolvedValue({ data: { id: 'input-7' }, error: null });
    const modelInputUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'supply_demand_snapshots') return { select: jest.fn().mockReturnValue(snapshotQuery) };
          if (table === 'ai_zone_observations') return { select: jest.fn().mockReturnValue(observationQuery) };
          if (table === 'model_inputs') return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({ single: modelInputSingle }),
            }),
            update: modelInputUpdate,
          };
          throw new Error(`unexpected table ${table}`);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new AiService(db as never);
    jest.spyOn(service as never, 'validateLiveZones').mockReturnValue([] as never);
    jest.spyOn(service as never, 'startForecastRun').mockResolvedValue('run-7' as never);
    jest.spyOn(service as never, 'request').mockResolvedValue({
      forecast_mode: 'live_snapshot_baseline',
      planning_status: 'not_required',
      reason_code: 'NO_POLICY_HOTSPOT',
    } as never);
    const persistOptimizerRun = jest.spyOn(service as never, 'persistOptimizerRun');
    const persistDecision = jest.spyOn(service as never, 'persistDecision');
    const persistForecast = jest.spyOn(service as never, 'persistForecast').mockResolvedValue(undefined as never);
    const persistProposal = jest.spyOn(service as never, 'persistProposal');
    jest.spyOn(service as never, 'completeForecastRun').mockResolvedValue(undefined as never);

    await service.generate(5, 7, true, true);

    expect(persistForecast).toHaveBeenCalledTimes(1);
    expect(persistOptimizerRun).not.toHaveBeenCalled();
    expect(persistDecision).not.toHaveBeenCalled();
    expect(persistProposal).not.toHaveBeenCalled();
    expect(modelInputUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
  });

  it('delegates concurrent replay identity and persistence to one atomic database command', async () => {
    const sourceAt = '2026-08-15T00:00:00.000Z';
    const zones = Array.from({ length: 30 }, (_, index) => ({
      zone_id: index + 1, demand_observed: 10, idle_supply: 8, enroute_supply: 0,
      rain_mm_h: 0, rain_forecast_15: 0, rain_forecast_30: 0, peak_flag: 0, holiday_flag: 0,
    }));
    const rpc = jest.fn().mockResolvedValue({
      data: [{ id: 9, captured_at: '2026-08-15T00:00:00.000Z', source_at: sourceAt, created: true }],
      error: null,
    });
    const db = {
      client: { rpc, from: jest.fn() },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new AiService(db as never);
    jest.spyOn(service as never, 'request').mockResolvedValue({ dataset: 'test', source_at: sourceAt, regime: 'normal', zones } as never);

    await expect(Promise.all([service.runReplay(sourceAt), service.runReplay(sourceAt)])).resolves.toEqual([
      expect.objectContaining({ snapshot: expect.objectContaining({ id: 9, sourceAt }) }),
      expect.objectContaining({ snapshot: expect.objectContaining({ id: 9, sourceAt }) }),
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('ingest_replay_snapshot', expect.objectContaining({
      p_source_at: sourceAt,
      p_scenario_code: 'NORMAL',
      p_zones: zones,
    }));
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('persists trained forecasts and gives the proposal a non-zero offer batch', async () => {
    const proposalInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'proposal-1' }, error: null }),
      }),
    });
    const forecastInsert = jest.fn().mockResolvedValue({ error: null });
    const outputInsert = jest.fn().mockResolvedValue({ error: null });
    const drivers = eligibleDriverQuery(3);
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'ai_zone_forecasts') return { insert: forecastInsert };
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

    await (service as unknown as { persistDecision(snapshot: object, decision: object, modelInputId: string | undefined, forecastRunId: string): Promise<void> })
      .persistDecision(
        { id: 7, captured_at: '2026-08-11T21:30:00Z' },
        {
          data_source: 'supabase:ai_zone_observations:7',
          forecast_mode: 'trained_model_replay',
          activation_policy: { incentive_amount: 20_000, incentive_budget_cap: 500_000, overbooking_factor: 1.6, assumed_accept_rate: 0.6 },
          activation_recommendation: {
            target_zones: [{ zone_id: 9, gap_remaining: 2, requested_offers: 4, expected_units_gained: 2, expected_gap_remaining: 0 }],
            total_requested_offers: 4, total_expected_units_gained: 2, total_expected_gap_remaining: 0,
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
            residual_gap: [{ zone_id: 9, gap_remaining: 2, suggested_activation: 2 }],
            plan_totals: { total_cost: 20_000, budget_cap: 500_000 },
            warnings: [],
          },
        },
        'model-input-1', 'run-1',
      );

    expect(forecastInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ forecast_run_id: 'run-1', model_version: 'lgbm_quantile_v1', forecast_mode: 'trained_model_replay' }),
    ]));
    expect(proposalInsert).toHaveBeenCalledWith(expect.objectContaining({
      generator_version: 'lgbm_quantile_v1',
      target_driver_count: 2,
      offer_count: 3,
      bonus_amount: 20_000,
      estimated_cost: 60_000,
      policy_status: 'PASSED',
      target_zone_ids: [9],
      source_plan: expect.objectContaining({
        forecast_run_id: 'run-1',
        model_input_id: 'model-input-1',
        candidate_source_zones: [expect.objectContaining({
          availableSupply: 2,
          capacitySource: 'optimizer_allocation',
          idleSupplyCurrent: 12,
          modelSurplus: 8,
          zoneId: 'AI-Z06',
        })],
        moves: [expect.objectContaining({ id: 'MV-01', source_supply_after: 10 })],
      }),
      simulation_details: expect.objectContaining({ eligible_driver_count: 3, scenario_id: 'rain-peak', forecast_run_id: 'run-1', model_input_id: 'model-input-1', plan_mode: 'HYBRID' }),
    }));
    expect(outputInsert).toHaveBeenCalledWith(expect.objectContaining({
      model_input_id: 'model-input-1',
      model_version: 'lgbm_quantile_v1',
      processing_status: 'PROPOSAL_CREATED',
      proposal_id: 'proposal-1',
    }));
    expect(db.unwrap).not.toHaveBeenCalledWith(null, null);
  });

  it('keeps a risk-advisory activation decision reviewable when no direct relocation source exists', async () => {
    const proposalInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'proposal-failed' }, error: null }),
      }),
    });
    const drivers = eligibleDriverQuery(5);
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'ai_zone_forecasts') return { insert: jest.fn().mockResolvedValue({ error: null }) };
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

    await (service as unknown as { persistDecision(snapshot: object, decision: object, modelInputId: string | undefined, forecastRunId: string): Promise<void> })
      .persistDecision(
        { id: 8, captured_at: '2026-08-11T21:30:00Z' },
        {
          data_source: 'test', forecast_mode: 'trained_model_replay', reason_code: 'RISK_ADVISORY_PROPOSAL',
          activation_policy: { incentive_amount: 20_000, incentive_budget_cap: 500_000, overbooking_factor: 1.6, assumed_accept_rate: 0.6 },
          activation_recommendation: {
            target_zones: [{ zone_id: 1, gap_remaining: 3, requested_offers: 5, expected_units_gained: 3, expected_gap_remaining: 0 }],
            total_requested_offers: 5, total_expected_units_gained: 3, total_expected_gap_remaining: 0,
            projected_gap_reduction_pct: 100, worst_case_commitment: 100_000, constrained_by_budget: false, accept_rate_source: 'policy_assumption',
          },
          forecast: { forecast_ts: '2026-08-11T21:45:00Z', horizon_min: 15, model_version: 'v1', regime: 'normal', zones: [] },
          hotspots: { hotspots: [] },
          plan: {
            moves: [], residual_gap: [{ zone_id: 1, gap_remaining: 3, suggested_activation: 3 }],
            plan_totals: { total_cost: 0, budget_cap: 500_000 },
            relocation_targets: [{ zone_id: 1, gap: 3, required_units: 3, is_policy_hotspot: false, target_basis: 'p90_p50' }],
            warnings: [
              { code: 'NO_SOLUTION', message: 'No source zone' },
              { code: 'RISK_ADVISORY_PROPOSAL', severity: 'info', message: 'Risk p90 advisory' },
            ],
          },
        }, undefined, 'run-2',
      );

    expect(proposalInsert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'UNDER_REVIEW',
      target_zone_ids: [1],
      policy_status: 'PASSED',
      bonus_amount: 20_000,
      target_driver_count: 3,
      offer_count: 5,
      estimated_cost: 100_000,
      simulation_details: expect.objectContaining({
        title: 'Khuyến nghị sớm theo risk p90 · 15 phút',
        plan_mode: 'ACTIVATION_ONLY',
        planning_basis: 'RISK_P90_ADVISORY',
        warnings: expect.arrayContaining([
          expect.objectContaining({ code: 'NO_RELOCATION_SOURCE' }),
          expect.objectContaining({ code: 'RISK_ADVISORY_PROPOSAL' }),
        ]),
      }),
    }));
  });

  it('persists a balanced no-solution result without violating the target-zone contract', async () => {
    const proposalInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'proposal-no-solution' }, error: null }),
      }),
    });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'driver_states') return eligibleDriverQuery(0);
          if (table === 'proposals') return { insert: proposalInsert };
          throw new Error(`unexpected table ${table}`);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new AiService(db as never);

    await (service as unknown as { persistProposal(snapshot: object, decision: object): Promise<void> })
      .persistProposal(
        { id: 140, captured_at: '2026-08-14T04:25:00Z' },
        {
          data_source: 'supabase:ai_zone_observations:140', forecast_mode: 'trained_model_replay',
          activation_policy: { incentive_amount: 20_000, incentive_budget_cap: 500_000, overbooking_factor: 1.6, assumed_accept_rate: 0.6 },
          activation_recommendation: {
            target_zones: [], total_requested_offers: 0, total_expected_units_gained: 0,
            total_expected_gap_remaining: 0, projected_gap_reduction_pct: 0,
            worst_case_commitment: 0, constrained_by_budget: false, accept_rate_source: 'policy_assumption',
          },
          forecast: { forecast_ts: '2026-08-14T04:30:00Z', horizon_min: 5, model_version: 'v1', regime: 'normal', zones: [] },
          hotspots: { hotspots: [], surplus_zones: [] },
          plan: { moves: [], residual_gap: [], plan_totals: { total_cost: 0, budget_cap: 500_000 }, warnings: [] },
        },
      );

    expect(proposalInsert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED_GENERATION',
      policy_status: 'FAILED',
      target_zone_ids: null,
      target_driver_count: 0,
      offer_count: 0,
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
    const runSingle = jest.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null });
    const runInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: runSingle }) });
    const runUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'supply_demand_snapshots') return snapshot;
          if (table === 'ai_zone_observations') return observationQuery;
          if (table === 'model_inputs') return { insert: inputInsert, update: inputUpdate };
          if (table === 'forecast_runs') return { insert: runInsert, update: runUpdate };
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
    expect(runUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', error_code: 'FORECAST_FAILED' }));
  });

  it('marks a declared model fallback as FALLBACK rather than a fresh completed forecast', async () => {
    const runUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const service = new AiService({
      client: { from: jest.fn(() => ({ update: runUpdate })) },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    } as never);

    await (service as unknown as { completeForecastRun(runId: string, decision: object): Promise<void> }).completeForecastRun('run-fallback', {
      data_source: 'fallback:baseline',
      forecast_mode: 'baseline_fallback',
      forecast: { model_version: 'baseline-v1' },
    });

    expect(runUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FALLBACK', model_version: 'baseline-v1', forecast_mode: 'baseline_fallback',
    }));
  });
});
