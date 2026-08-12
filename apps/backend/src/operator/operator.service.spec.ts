import { OperatorService } from './operator.service';

type Row = Record<string, unknown>;

class ReadQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly orders: Array<{ ascending: boolean; column: string }> = [];
  private limitCount?: number;

  constructor(private rows: Row[]) {}

  select() { return this; }
  in() { return this; }
  eq() { return this; }
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
});
