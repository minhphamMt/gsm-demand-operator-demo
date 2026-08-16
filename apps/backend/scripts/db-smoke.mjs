import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const client = createClient(url, key, { auth: { persistSession: false } });
const checks = [
  ['snapshots', client.from('supply_demand_snapshots').select('*').limit(1)],
  ['cells', client.from('supply_demand_cells').select('*').limit(1)],
  ['h3 geojson view', client.from('h3_cells_api_v').select('h3_index,center_geojson,boundary_geojson').limit(1)],
  ['proposals', client.from('proposals').select('*').limit(2)],
  ['campaigns', client.from('campaigns').select('*').limit(2)],
  ['offers+campaigns', client.from('driver_offers').select('*, campaigns(*)').limit(2)],
  [
    'driver geojson view',
    client.from('driver_states_api_v').select('driver_id,current_location_geojson').limit(2),
  ],
  ['audit', client.from('audit_logs').select('*').limit(2)],
];

const results = await Promise.all(
  checks.map(async ([name, query]) => {
    const { data, error } = await query;
    return { name, ok: !error, rows: data?.length ?? 0, error: error?.message };
  }),
);

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;
