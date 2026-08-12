import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}
if (process.argv.includes('--commit')) {
  throw new Error('Simulation commit is intentionally disabled. Integrate and validate a real model before enabling DB writes.');
}
const outIndex = process.argv.indexOf('--out');
const outputPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
if (outIndex >= 0 && !outputPath) throw new Error('--out requires a file path');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: snapshot, error: snapshotError } = await db.from('supply_demand_snapshots')
  .select('id,captured_at,scenario_code').order('captured_at', { ascending: false }).limit(1).single();
if (snapshotError || !snapshot) throw new Error(`No snapshot input: ${snapshotError?.code ?? 'missing'}`);
const { data: cells, error: cellsError } = await db.from('supply_demand_cells').select('*').eq('snapshot_id', snapshot.id);
if (cellsError) throw new Error(`Cannot read snapshot cells: ${cellsError.code}`);

const normalized = (cells ?? []).map((cell) => {
  const supply = Number(cell.available_supply ?? cell.current_supply ?? 0);
  const demand = Number(cell.predicted_demand ?? cell.current_demand ?? 0);
  return { h3Index: cell.h3_index, supply, demand, gap: demand - supply };
});
const shortages = normalized.filter(({ gap }) => gap > 0).sort((a, b) => b.gap - a.gap);
const surpluses = normalized.filter(({ gap }) => gap < 0).sort((a, b) => a.gap - b.gap);
const moves = [];
for (const target of shortages) {
  let needed = target.gap;
  for (const source of surpluses) {
    const available = Math.max(0, -source.gap - moves.filter((move) => move.fromH3 === source.h3Index).reduce((sum, move) => sum + move.drivers, 0));
    const drivers = Math.min(needed, available);
    if (drivers > 0) moves.push({ fromH3: source.h3Index, toH3: target.h3Index, drivers });
    needed -= drivers;
    if (needed <= 0) break;
  }
}

const artifact = {
  dataMode: 'SIMULATED',
  writeMode: 'DRY_RUN_ONLY',
  generator: 'MOCK:deterministic-shortage-v1',
  generatedAt: new Date().toISOString(),
  inputSnapshot: snapshot,
  disclaimer: 'Không phải kết quả model. Không ghi DB và không được tự động kích hoạt campaign.',
  hotspots: shortages.map(({ h3Index, gap, supply, demand }, index) => ({ rank: index + 1, h3Index, shortage: gap, supply, predictedDemand: demand })),
  proposalDraft: { moves, residualGap: Math.max(0, shortages.reduce((sum, cell) => sum + cell.gap, 0) - moves.reduce((sum, move) => sum + move.drivers, 0)) },
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (outputPath) await writeFile(resolve(outputPath), serialized, { encoding: 'utf8', mode: 0o600 });
else process.stdout.write(serialized);
