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

  it('detects relocation moves with SQL JSON expansion, not unsupported JSONPath functions', () => {
    const sql = migration('20260812215000_relocation_only_review.sql');

    expect(sql).toContain('jsonb_array_elements');
    expect(sql).not.toContain('$.moves[*] ? (coalesce(');
  });
});
