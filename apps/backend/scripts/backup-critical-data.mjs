import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const outputArg = process.argv[2];
if (!outputArg) throw new Error('Usage: npm run backup:critical -- <output-file.json>');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const tables = ['supply_demand_snapshots', 'supply_demand_cells', 'hotspots', 'audit_logs'];

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`Backup query failed for ${table}: ${error.code}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const data = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await readAll(table)])));
const canonical = JSON.stringify(data);
const backup = {
  format: 'gsm-critical-backup/v1',
  createdAt: new Date().toISOString(),
  sourceProject: new URL(process.env.SUPABASE_URL).hostname.split('.')[0],
  tables: Object.fromEntries(tables.map((table) => [table, data[table].length])),
  sha256: createHash('sha256').update(canonical).digest('hex'),
  data,
};
const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(JSON.stringify({ output, tables: backup.tables, sha256: backup.sha256 }, null, 2));
