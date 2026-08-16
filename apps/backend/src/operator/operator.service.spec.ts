import { OperatorService } from './operator.service';

type Row = Record<string, unknown>;

class ReadQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly orders: Array<{ ascending: boolean; column: string }> = [];
  private limitCount?: number;

  constructor(private rows: Row[]) {}

  select() { return this; }
  in() { return this; }
  lt() { return this; }
  eq() { return this; }
  neq() { return this; }
  gte() { return this; }
  lte() { return this; }
  order(column: string, options: { ascending: boolean } = { ascending: true }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  async maybeSingle() {
    const rows = this.sortedRows();
    return { data: rows[0] ?? null, error: null };
  }
  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.sortedRows(), error: null }).then(onfulfilled ?? undefined);
  }

  private sortedRows() {
    const rows = [...this.rows].sort((left, right) => {
      for (const order of this.orders) {
        const leftValue = order.column.endsWith('_at')
          ? new Date(String(left[order.column])).getTime()
          : Number(left[order.column]);
        const rightValue = order.column.endsWith('_at')
          ? new Date(String(right[order.column])).getTime()
          : Number(right[order.column]);
        if (leftValue === rightValue) continue;
        return (leftValue < rightValue ? -1 : 1) * (order.ascending ? 1 : -1);
      }
      return 0;
    });
    return this.limitCount === undefined ? rows : rows.slice(0, this.limitCount);
  }
}

describe('OperatorService snapshot selection', () => {
  it('selects the latest ingested snapshot instead of an older row with a future captured_at', async () => {
    const snapshots = new ReadQuery([
      {
        id: 47,
        captured_at: '2026-09-25T00:00:00.000Z',
        created_at: '2026-08-11T00:00:00.000Z',
        scenario_code: 'RAIN',
      },
      {
        id: 86,
        captured_at: '2026-08-12T05:00:00.000Z',
        created_at: '2026-08-12T05:00:01.000Z',
        scenario_code: 'NORMAL',
      },
    ]);
    const observations = new ReadQuery([
      {
        data_status: 'live',
        demand_observed: 10,
        idle_supply: 8,
        snapshot_id: 86,
        source_name: 'AI_BRANCH_TEST_REPLAY:2026-08-12T05:00:00.000Z',
        zone_id: 1,
      },
    ]);
    const zones = new ReadQuery([{ is_active: true, zone_code: 'AI-Z01', zone_id: 1, zone_name: 'Ba Dinh' }]);
    const forecasts = new ReadQuery([]);
    const db = {
      client: {
        from: jest.fn((table: string) => ({
          ai_zone_forecasts: forecasts,
          ai_zone_observations: observations,
          ai_zone_registry_api_v: zones,
          supply_demand_snapshots: snapshots,
        })[table]),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new OperatorService(db as never);

    await expect(service.latestSnapshot()).resolves.toMatchObject({
      replayStep: '86',
      sourceAt: '2026-08-12T05:00:00.000Z',
      kpis: { fleetAvailable: 8, fulfillmentRate: 80, requests: 10, residualGap: 2 },
    });
    expect(snapshots.orders.slice(0, 2)).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
  });

  it('publishes one complete immutable run per horizon and never mixes rows from multiple runs', async () => {
    const snapshots = new ReadQuery([{ id: 86, captured_at: '2026-08-12T05:00:00.000Z', created_at: '2026-08-12T05:00:01.000Z', scenario_code: 'NORMAL' }]);
    const observations = new ReadQuery([
      { data_status: 'live', demand_observed: 10, idle_supply: 8, snapshot_id: 86, source_name: 'AI_BRANCH_TEST_REPLAY:2026-08-12T05:00:00.000Z', zone_id: 1 },
      { data_status: 'live', demand_observed: 9, idle_supply: 8, snapshot_id: 86, source_name: 'AI_BRANCH_TEST_REPLAY:2026-08-12T05:00:00.000Z', zone_id: 2 },
    ]);
    const zones = new ReadQuery([
      { is_active: true, zone_code: 'AI-Z01', zone_id: 1, zone_name: 'Ba Dinh' },
      { is_active: true, zone_code: 'AI-Z02', zone_id: 2, zone_name: 'Hoan Kiem' },
    ]);
    const run = (id: string, completedAt: string) => ({ id, status: 'COMPLETED', completed_at: completedAt, model_version: id, feature_version: 'feature-v1', policy_version: 'policy-v1', input_hash: id, forecast_mode: 'trained_model_replay', data_source: 'db' });
    const forecasts = new ReadQuery([
      { forecast_run_id: 'old-5', forecast_runs: run('old-5', '2026-08-12T05:00:01.000Z'), horizon_min: 5, zone_id: 1, forecast_at: '2026-08-12T05:05:00.000Z', predicted_demand: 12, predicted_supply: 8 },
      { forecast_run_id: 'old-5', forecast_runs: run('old-5', '2026-08-12T05:00:01.000Z'), horizon_min: 5, zone_id: 2, forecast_at: '2026-08-12T05:05:00.000Z', predicted_demand: 11, predicted_supply: 8 },
      { forecast_run_id: 'partial-5', forecast_runs: run('partial-5', '2026-08-12T05:00:02.000Z'), horizon_min: 5, zone_id: 1, forecast_at: '2026-08-12T05:05:00.000Z', predicted_demand: 12, predicted_supply: 8 },
      { forecast_run_id: 'run-15', forecast_runs: run('run-15', '2026-08-12T05:00:03.000Z'), horizon_min: 15, zone_id: 1, forecast_at: '2026-08-12T05:15:00.000Z', predicted_demand: 13, predicted_supply: 8 },
      { forecast_run_id: 'run-15', forecast_runs: run('run-15', '2026-08-12T05:00:03.000Z'), horizon_min: 15, zone_id: 2, forecast_at: '2026-08-12T05:15:00.000Z', predicted_demand: 12, predicted_supply: 8 },
    ]);
    const db = {
      client: { from: jest.fn((table: string) => ({ ai_zone_forecasts: forecasts, ai_zone_observations: observations, ai_zone_registry_api_v: zones, supply_demand_snapshots: snapshots })[table]) },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };

    await expect(new OperatorService(db as never).latestSnapshot()).resolves.toMatchObject({
      ai: {
        horizons: [15],
        forecastRuns: [expect.objectContaining({ id: 'run-15', horizonMinutes: 15, zoneCount: 2 })],
      },
    });
  });

  it('keeps an existing high hotspot visible until its hysteresis exit threshold is crossed', async () => {
    const snapshots = new ReadQuery([{ id: 86, captured_at: '2026-08-12T05:00:00.000Z', created_at: '2026-08-12T05:00:01.000Z', scenario_code: 'NORMAL' }]);
    const observations = new ReadQuery([{ data_status: 'live', demand_observed: 10, idle_supply: 8, snapshot_id: 86, source_name: 'AI_BRANCH_TEST_REPLAY:2026-08-12T05:00:00.000Z', zone_id: 1 }]);
    const zones = new ReadQuery([{ is_active: true, zone_code: 'AI-Z01', zone_id: 1, zone_name: 'Ba Dinh' }]);
    const forecasts = new ReadQuery([{
      forecast_run_id: 'run-5', forecast_runs: { id: 'run-5', status: 'COMPLETED', completed_at: '2026-08-12T05:00:01.000Z' },
      horizon_min: 5, zone_id: 1, forecast_at: '2026-08-12T05:05:00.000Z', predicted_demand: 10, predicted_supply: 5,
    }]);
    const db = {
      client: { from: jest.fn((table: string) => ({ ai_zone_forecasts: forecasts, ai_zone_observations: observations, ai_zone_registry_api_v: zones, supply_demand_snapshots: snapshots })[table]) },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new OperatorService(db as never);
    jest.spyOn(service as unknown as { previousHotspotSeverities: () => Promise<Map<string, 'High' | 'Critical'>> }, 'previousHotspotSeverities')
      .mockResolvedValue(new Map<string, 'High' | 'Critical'>([['AI-Z01', 'High']]));

    await expect(service.latestSnapshot()).resolves.toMatchObject({
      hotspots: [expect.objectContaining({ zoneId: 'AI-Z01', severity: 'High', threshold: 4, isPersistent: true })],
    });
  });

  it('blocks approval without an unaudited status mutation when a newer snapshot exists', async () => {
    const proposalRead = {
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'proposal-1', input_snapshot_id: 4, status: 'UNDER_REVIEW', policy_status: 'PASSED', window_end_at: '2099-01-01T00:00:00.000Z' },
        error: null,
      }),
      select: jest.fn(),
    };
    proposalRead.eq.mockReturnValue(proposalRead);
    proposalRead.select.mockReturnValue(proposalRead);
    const commandRead = {
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn(),
    };
    commandRead.eq.mockReturnValue(commandRead);
    commandRead.select.mockReturnValue(commandRead);
    const snapshots = new ReadQuery([{ id: 5, created_at: '2026-08-12T05:10:00.000Z' }]);
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'proposals') return { select: jest.fn().mockReturnValue(proposalRead) };
          if (table === 'command_records') return commandRead;
          if (table === 'supply_demand_snapshots') return snapshots;
          throw new Error(`Unexpected table ${table}`);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };

    await expect(new OperatorService(db as never).reviewProposal('proposal-1', 'APPROVED', { expectedVersion: 1, note: 'approved' }, 'actor-1', 'request-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_PROPOSAL' }) });
    expect(db.client.from).not.toHaveBeenCalledWith('operational_audit_logs');
  });

  it('activates an approved proposal within its window after a newer snapshot is ingested', async () => {
    const proposal = new ReadQuery([{
      id: 'proposal-1',
      input_snapshot_id: 4,
      status: 'APPROVED',
      policy_status: 'PASSED',
      window_end_at: '2099-01-01T00:00:00.000Z',
      bonus_amount: 50_000,
      estimated_cost: 100_000,
      target_driver_count: 2,
      simulation_details: {
        metrics_after_relocation: { unmet_demand: 4 },
        metrics_after_activation_expected: { unmet_demand: 2 },
      },
      source_plan: { residual_gap: [{ gap_remaining: 4 }] },
    }]);
    let campaignReads = 0;
    const rpc = jest.fn().mockResolvedValue({ data: 'campaign-1', error: null });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'proposals') return proposal;
          if (table === 'campaigns') {
            campaignReads += 1;
            if (campaignReads < 3) return new ReadQuery([]);
            return new ReadQuery([{
              id: 'campaign-1', proposal_id: 'proposal-1', status: 'ACTIVE',
              target_zone_ids: [1], target_driver_count: 2, budget_used: 0,
              budget_limit: 100_000, bonus_amount: 50_000,
              start_at: '2026-08-16T13:45:00.000Z', end_at: '2099-01-01T00:00:00.000Z',
            }]);
          }
          if (['dispatch_batches', 'driver_offers', 'campaign_participations', 'trips'].includes(table)) {
            return new ReadQuery([]);
          }
          if (table === 'supply_demand_snapshots') {
            throw new Error('Activation must not revalidate the latest snapshot after approval');
          }
          throw new Error(`Unexpected table ${table}`);
        }),
        rpc,
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };

    await expect(new OperatorService(db as never).activateProposal(
      'proposal-1', { responseMode: 'human' }, 'actor-1', 'request-1',
    )).resolves.toMatchObject({ id: 'campaign-1', planId: 'proposal-1', status: 'Active' });
    expect(rpc).toHaveBeenCalledWith('activate_proposal', expect.objectContaining({
      p_proposal_id: 'proposal-1', p_actor_id: 'actor-1', p_request_id: 'request-1',
    }));
  });

  it('rejects a revision submitted from an older proposal version before calling the RPC', async () => {
    const proposalRead = {
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'proposal-1', input_snapshot_id: 4, status: 'UNDER_REVIEW', source_plan: {}, version: 2, window_end_at: '2099-01-01T00:00:00.000Z' },
        error: null,
      }),
      select: jest.fn(),
    };
    proposalRead.eq.mockReturnValue(proposalRead);
    proposalRead.select.mockReturnValue(proposalRead);
    const rpc = jest.fn();
    const db = {
      client: { from: jest.fn(() => proposalRead), rpc },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new OperatorService(db as never);
    const dto: Parameters<OperatorService['reviseProposal']>[1] = {
      expectedVersion: 1, sourcePlan: { moves: [], residual_gap: [] }, targetDriverCount: 0,
      campaignDurationMinutes: 15, bonusAmount: 0, zoneTripBonus: 0, fareMultiplier: 1,
      budgetLimit: 0, note: 'stale browser form',
    };

    await expect(service.reviseProposal('proposal-1', dto, 'actor-1', 'request-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROPOSAL_VERSION_CONFLICT' }) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('builds baselines from per-zone observations so surplus cannot cancel another zone gap', async () => {
    const snapshots = new ReadQuery([
      { id: 2, captured_at: '2026-08-12T05:05:00.000Z', created_at: '2026-08-12T05:05:01.000Z' },
      { id: 1, captured_at: '2026-08-12T05:00:00.000Z', created_at: '2026-08-12T05:00:01.000Z' },
    ]);
    const observations = new ReadQuery([
      { snapshot_id: 2, data_status: 'live', demand_observed: 10, idle_supply: 0 },
      { snapshot_id: 2, data_status: 'live', demand_observed: 10, idle_supply: 20 },
      { snapshot_id: 1, data_status: 'live', demand_observed: 10, idle_supply: 10 },
    ]);
    const db = {
      client: { from: jest.fn((table: string) => table === 'supply_demand_snapshots' ? snapshots : observations) },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };

    await expect(new OperatorService(db as never).baselines()).resolves.toEqual([
      expect.objectContaining({ id: 'no-action', fulfillmentRate: 50, residualGap: 10 }),
      expect.objectContaining({ id: 'historical-average', fulfillmentRate: 75, residualGap: 5 }),
    ]);
  });

  it('rejects an inverted audit date range before querying the database', async () => {
    const from = jest.fn();
    const service = new OperatorService({ client: { from }, unwrap: jest.fn() } as never);

    await expect(service.listAudit({
      page: 1,
      pageSize: 25,
      from: '2026-08-15T01:00:00.000Z',
      to: '2026-08-14T01:00:00.000Z',
    })).rejects.toMatchObject({ status: 422 });
    expect(from).not.toHaveBeenCalled();
  });
});
