import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = (name: string) => readFileSync(
  resolve(process.cwd(), 'supabase', 'migrations', name),
  'utf8',
);

describe('operator database contracts', () => {
  it('re-asserts a real five-minute forecast horizon on both forecast tables', () => {
    const sql = migration('20260812220000_reassert_five_minute_forecast_contract.sql');

    expect(sql).toContain('ai_zone_forecasts_horizon_min_check');
    expect(sql).toContain('model_outputs_horizon_min_check');
    expect(sql.match(/horizon_min in \(5, 15, 30\)/g)).toHaveLength(2);
  });

  it('adds the product 10-minute horizon to persisted forecasts', () => {
    const sql = migration('20260816133000_align_forecast_horizons_5_10_15.sql');

    expect(sql).toContain('forecast_runs_horizon_min_check');
    expect(sql.match(/horizon_min in \(5, 10, 15, 30\)/g)).toHaveLength(3);
  });

  it('detects relocation moves with SQL JSON expansion, not unsupported JSONPath functions', () => {
    const sql = migration('20260812215000_relocation_only_review.sql');

    expect(sql).toContain('jsonb_array_elements');
    expect(sql).not.toContain('$.moves[*] ? (coalesce(');
  });

  it('makes replay ingestion atomic and orders snapshots by source/capture time', () => {
    const sql = migration('20260824215000_replay_snapshot_identity.sql');

    expect(sql).toContain('source_at timestamptz');
    expect(sql).toContain('effective_at timestamptz');
    expect(sql).toContain('supply_demand_snapshots_replay_source_at_unique');
    expect(sql).toContain('create or replace function public.ingest_replay_snapshot');
    expect(sql).toContain('on conflict do nothing');
    expect(sql).toContain('previous_snapshots.effective_at < v_snapshot.effective_at');
    expect(sql).toContain('create or replace function public.previous_snapshot_id');
  });

  it('refreshes changed replay content without duplicating the source bucket', () => {
    const sql = migration('20260825112500_refresh_replay_snapshot_content.sql');

    expect(sql).toContain('for update');
    expect(sql).toContain('on conflict (snapshot_id, zone_id) do update');
    expect(sql).toContain("status = 'SUPERSEDED'");
    expect(sql).toContain('if not v_changed then');
  });
});
