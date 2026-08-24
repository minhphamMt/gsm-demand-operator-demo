import { OperatorService } from './operator.service';

type Row = Record<string, unknown>;

class ReadQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly orders: Array<{ ascending: boolean; column: string }> = [];
  readonly selections: unknown[] = [];
  private limitCount?: number;

  constructor(private rows: Row[]) {}

  select(columns?: unknown) { this.selections.push(columns); return this; }
  in() { return this; }
  lt() { return this; }
  eq() { return this; }
  neq() { return this; }
  is() { return this; }
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
  it('loads a dispatch list with three fixed reads instead of three reads per batch', async () => {
    const batches = new ReadQuery([
      { id: 'batch-2', proposal_id: 'proposal-2', proposal_version: 2, approved_content_hash: 'hash-2', status: 'IN_PROGRESS', released_at: '2026-08-24T15:02:00.000Z', request_id: 'request-2' },
      { id: 'batch-1', proposal_id: 'proposal-1', proposal_version: 1, approved_content_hash: 'hash-1', status: 'EXECUTED', released_at: '2026-08-24T15:01:00.000Z', request_id: 'request-1' },
    ]);
    const moves = new ReadQuery([
      { id: 'move-1', batch_id: 'batch-1', source_move_key: '1:2', source_zone_id: 1, target_zone_id: 2, planned_units: 2, acknowledged_units: 2, arrived_units: 2, available_units: 2, failed_units: 0, state: 'AVAILABLE', route_source: 'approved_plan', eta_minutes: 5, distance_km: 1.2, created_at: '2026-08-24T15:01:01.000Z' },
      { id: 'move-2', batch_id: 'batch-2', source_move_key: '3:4', source_zone_id: 3, target_zone_id: 4, planned_units: 1, acknowledged_units: 1, arrived_units: 0, available_units: 0, failed_units: 0, state: 'EN_ROUTE', route_source: 'approved_plan', eta_minutes: 8, distance_km: 2.4, created_at: '2026-08-24T15:02:01.000Z' },
    ]);
    const reconciliations = new ReadQuery([
      { id: 'reconciliation-1', batch_id: 'batch-1', revision: 1, planned_units: 2, acknowledged_units: 2, arrived_units: 2, available_units: 2, failed_units: 0, actual_contribution: 2, residual_gap: 0, is_snapshot_fresh: true, created_at: '2026-08-24T15:03:00.000Z' },
    ]);
    const from = jest.fn((table: string) => ({
      dispatch_batches: batches,
      dispatch_moves: moves,
      reconciliations,
    })[table]);
    const service = new OperatorService({
      client: { from },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    } as never);

    await expect(service.listDispatch()).resolves.toEqual([
      expect.objectContaining({ id: 'batch-2', moves: [expect.objectContaining({ id: 'move-2' })], reconciliations: [] }),
      expect.objectContaining({ id: 'batch-1', moves: [expect.objectContaining({ id: 'move-1' })], reconciliations: [expect.objectContaining({ id: 'reconciliation-1' })] }),
    ]);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['dispatch_batches', 'dispatch_moves', 'reconciliations']);
    expect([batches, moves, reconciliations].flatMap((query) => query.selections)).not.toContain('*');
  });

  it('hydrates campaign funnel counts in one projected relational read', async () => {
    const campaigns = new ReadQuery([{
      id: 'campaign-1', proposal_id: 'proposal-1', status: 'ACTIVE', target_zone_ids: [2],
      target_driver_count: 2, budget_used: 50_000, budget_limit: 100_000, bonus_amount: 25_000,
      start_at: '2026-08-24T15:00:00.000Z', end_at: '2026-08-24T16:00:00.000Z', created_at: '2026-08-24T14:59:00.000Z',
      driver_offers: [
        { campaign_id: 'campaign-1', status: 'ACCEPTED', sent_at: '2026-08-24T15:00:01.000Z', viewed_at: '2026-08-24T15:00:02.000Z' },
        { campaign_id: 'campaign-1', status: 'DECLINED', sent_at: '2026-08-24T15:00:01.000Z', viewed_at: '2026-08-24T15:00:02.000Z' },
      ],
      campaign_participations: [{ campaign_id: 'campaign-1', status: 'EN_ROUTE' }],
      trips: [{ campaign_id: 'campaign-1', status: 'COMPLETED' }],
    }]);
    const from = jest.fn(() => campaigns);
    const service = new OperatorService({
      client: { from },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    } as never);

    await expect(service.listCampaigns()).resolves.toEqual([
      expect.objectContaining({
        id: 'campaign-1', accepted: 1, declined: 1, enRoute: 1, offersSent: 2, qualifiedTrips: 1, viewed: 2,
      }),
    ]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(campaigns.selections[0]).toEqual(expect.stringContaining('driver_offers('));
    expect(campaigns.selections).not.toContain('*');
  });

  it('selects the latest snapshot by replay source time instead of insertion id or captured-at wall clock', async () => {
    const snapshots = new ReadQuery([
      {
        id: 47,
        captured_at: '2026-09-25T00:00:00.000Z',
        source_at: '2026-08-11T00:00:00.000Z',
        effective_at: '2026-08-11T00:00:00.000Z',
        created_at: '2026-08-11T00:00:00.000Z',
        scenario_code: 'RAIN',
      },
      {
        id: 86,
        captured_at: '2026-08-12T05:00:00.000Z',
        source_at: '2026-08-12T05:00:00.000Z',
        effective_at: '2026-08-12T05:00:00.000Z',
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
    expect(snapshots.orders.slice(0, 3)).toEqual([
      { column: 'effective_at', ascending: false },
      { column: 'captured_at', ascending: false },
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
      client: {
        from: jest.fn((table: string) => ({ ai_zone_forecasts: forecasts, ai_zone_observations: observations, ai_zone_registry_api_v: zones, supply_demand_snapshots: snapshots })[table]),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      },
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
    let snapshotReads = 0;
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'proposals') return { select: jest.fn().mockReturnValue(proposalRead) };
          if (table === 'command_records') return commandRead;
          if (table === 'supply_demand_snapshots') {
            snapshotReads += 1;
            return snapshotReads === 1
              ? new ReadQuery([{
                id: 4,
                captured_at: '2026-08-12T05:00:00.000Z',
                source_at: null,
                data_source: 'LIVE',
              }])
              : new ReadQuery([{
                id: 5,
                captured_at: '2026-08-12T05:10:00.000Z',
                source_at: null,
                data_source: 'LIVE',
              }]);
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };

    await expect(new OperatorService(db as never).reviewProposal('proposal-1', 'APPROVED', { expectedVersion: 1, note: 'approved' }, 'actor-1', 'request-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_PROPOSAL' }) });
    expect(db.client.from).not.toHaveBeenCalledWith('operational_audit_logs');
  });

  it('approves a fresh replay proposal by source bucket even when later replay buckets exist', async () => {
    const proposalRead = new ReadQuery([{
      id: 'proposal-replay',
      input_snapshot_id: 328,
      status: 'UNDER_REVIEW',
      policy_status: 'PASSED',
      window_end_at: '2099-01-01T00:00:00.000Z',
      generator_type: 'AGENT',
      simulation_details: {
        metrics_before: { unmet_demand: 10 },
        metrics_after_relocation: { unmet_demand: 8 },
      },
      source_plan: { moves: [{ drivers: 2 }] },
    }]);
    const commandRead = new ReadQuery([]);
    const snapshots = new ReadQuery([{
      id: 328,
      captured_at: '2026-08-16T07:20:00.000Z',
      source_at: '2026-09-25T01:35:00.000Z',
      data_source: 'AI_PARQUET_DATASET',
    }]);
    const rpc = jest.fn().mockResolvedValue({ data: 'proposal-replay', error: null });
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'proposals') return proposalRead;
          if (table === 'command_records') return commandRead;
          if (table === 'supply_demand_snapshots') return snapshots;
          throw new Error(`Unexpected table ${table}`);
        }),
        rpc,
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new OperatorService(db as never);
    jest.spyOn(service, 'getProposal').mockResolvedValue({ id: 'proposal-replay', status: 'Approved' } as never);

    await expect(service.reviewProposal(
      'proposal-replay',
      'APPROVED',
      { expectedVersion: 1, note: 'approved' },
      'actor-1',
      'request-1',
    )).resolves.toMatchObject({ id: 'proposal-replay', status: 'Approved' });
    expect(rpc).toHaveBeenCalledWith('review_proposal', expect.objectContaining({
      p_proposal_id: 'proposal-replay',
      p_decision: 'APPROVED',
    }));
    expect(db.client.from).toHaveBeenCalledWith('supply_demand_snapshots');
  });

  it('treats live snapshots captured in the same bucket as current despite different ids', async () => {
    let snapshotReads = 0;
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table !== 'supply_demand_snapshots') throw new Error(`Unexpected table ${table}`);
          snapshotReads += 1;
          return snapshotReads === 1
            ? new ReadQuery([{
              id: 4,
              captured_at: '2026-08-12T05:00:00.000Z',
              source_at: null,
              data_source: 'LIVE',
            }])
            : new ReadQuery([{
              id: 5,
              captured_at: '2026-08-12T05:00:00.000Z',
              source_at: null,
              data_source: 'LIVE',
            }]);
        }),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };
    const service = new OperatorService(db as never) as unknown as {
      assertProposalSnapshotCurrent: (proposal: { input_snapshot_id: number }, proposalId: string) => Promise<void>;
    };

    await expect(service.assertProposalSnapshotCurrent(
      { input_snapshot_id: 4 },
      'proposal-live',
    )).resolves.toBeUndefined();
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

  it('blocks dispatch for an approved proposal after its execution window expires', async () => {
    const previousDispatchFlag = process.env.OPERATOR_DISPATCH_ENABLED;
    process.env.OPERATOR_DISPATCH_ENABLED = 'true';
    const rpc = jest.fn();
    const db = {
      client: {
        from: jest.fn((table: string) => {
          if (table === 'proposals') return new ReadQuery([{
            id: 'proposal-expired',
            status: 'APPROVED',
            window_end_at: '2020-01-01T00:00:00.000Z',
          }]);
          throw new Error(`Unexpected table ${table}`);
        }),
        rpc,
      },
      unwrap: jest.fn((data: unknown, error: unknown) => { if (error) throw error; return data; }),
    };

    try {
      await expect(new OperatorService(db as never).releaseDispatch(
        'proposal-expired', 'actor-1', 'request-1', 'dispatch-1',
      )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_PROPOSAL' }) });
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      if (previousDispatchFlag === undefined) delete process.env.OPERATOR_DISPATCH_ENABLED;
      else process.env.OPERATOR_DISPATCH_ENABLED = previousDispatchFlag;
    }
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
      { id: 2, captured_at: '2026-08-12T05:05:00.000Z', effective_at: '2026-08-12T05:05:00.000Z', created_at: '2026-08-12T05:05:01.000Z' },
      { id: 1, captured_at: '2026-08-12T05:00:00.000Z', effective_at: '2026-08-12T05:00:00.000Z', created_at: '2026-08-12T05:00:01.000Z' },
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
