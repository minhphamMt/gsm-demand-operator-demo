import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const commit = process.argv.includes('--commit');
const regimeArg = process.argv.indexOf('--regime');
const regime = regimeArg >= 0 ? process.argv[regimeArg + 1] : 'rain_peak';
if (!['normal', 'peak', 'rain', 'rain_peak'].includes(regime)) throw new Error('--regime must be normal, peak, rain, or rain_peak');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const root = resolve(import.meta.dirname, '..', '..');
const zoneRegistryPath = resolve(root, 'AI', 'config', 'zone_registry.json');
const aiServiceUrl = (process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const affectedTables = [
  'reward_records',
  'driver_location_events',
  'trips',
  'campaign_participations',
  'driver_offers',
  'model_outputs',
  'model_inputs',
  'campaigns',
  'proposals',
  'hotspots',
  'audit_logs',
  'ai_zone_forecasts',
  'ai_zone_observations',
  'supply_demand_cells',
  'supply_demand_snapshots',
];

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`Cannot read ${table}: ${error.code} ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function deleteAll(table, primaryKey) {
  const { error } = await db.from(table).delete().not(primaryKey, 'is', null);
  if (error) throw new Error(`Cannot clean ${table}: ${error.code} ${error.message}`);
}

const [zoneRegistry, replayResponse] = await Promise.all([
  readFile(zoneRegistryPath, 'utf8').then(JSON.parse),
  fetch(`${aiServiceUrl}/api/v1/datasets/snapshots/next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ regime }),
  }),
]);
if (!replayResponse.ok) throw new Error(`AI dataset service returned ${replayResponse.status}: ${await replayResponse.text()}`);
const replay = await replayResponse.json();
const fixture = replay.zones.sort((left, right) => left.zone_id - right.zone_id);
if (zoneRegistry.length !== 30 || fixture.length !== 30) {
  throw new Error(`AI contract requires 30 zones; registry=${zoneRegistry.length}, fixture=${fixture.length}`);
}
const expectedIds = Array.from({ length: 30 }, (_, index) => index + 1);
if (fixture.some((row, index) => row.zone_id !== expectedIds[index])) {
  throw new Error('Fixture does not contain exactly zone_id 1..30');
}

const { data: dbZones, error: zoneError } = await db.from('ai_zone_registry')
  .select('zone_id,zone_name,center_lat,center_lng,is_active').order('zone_id');
if (zoneError) throw new Error(`Cannot validate AI zone registry: ${zoneError.code}`);
const zoneDrift = zoneRegistry.flatMap((zone, index) => {
  const current = dbZones?.[index];
  return !current || current.zone_id !== zone.zone_id || current.zone_name !== zone.zone_name
    || Number(current.center_lat) !== Number(zone.lat) || Number(current.center_lng) !== Number(zone.lng)
    || current.is_active !== true
    ? [{ zoneId: zone.zone_id, expected: zone.zone_name, actual: current?.zone_name ?? null }]
    : [];
});
if (zoneDrift.length) throw new Error(`DB zone registry differs from branch AI: ${JSON.stringify(zoneDrift)}`);

const before = Object.fromEntries(await Promise.all(
  affectedTables.map(async (table) => [table, await readAll(table)]),
));
const countsBefore = Object.fromEntries(affectedTables.map((table) => [table, before[table].length]));

if (!commit) {
  console.log(JSON.stringify({ mode: 'DRY_RUN', dataset: replay.dataset, sourceAt: replay.source_at, regime: replay.regime, zoneRegistry: 'MATCH', countsBefore }, null, 2));
  process.exit(0);
}

const canonical = JSON.stringify(before);
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupPath = resolve(root, 'backEnd', 'backups', `pre-ai-clean-${timestamp}.json`);
const backup = {
  format: 'gsm-ai-clean-backup/v1',
  createdAt: new Date().toISOString(),
  sourceProject: new URL(process.env.SUPABASE_URL).hostname.split('.')[0],
  tables: countsBefore,
  sha256: createHash('sha256').update(canonical).digest('hex'),
  data: before,
};
await mkdir(dirname(backupPath), { recursive: true });
await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

const { error: stateError } = await db.from('driver_states').update({
  is_online: false,
  operational_status: 'OFFLINE',
  current_location: null,
  current_h3_index: null,
  active_campaign_id: null,
  active_trip_id: null,
  location_accuracy_m: null,
  location_source: null,
  location_updated_at: null,
  updated_at: new Date().toISOString(),
}).not('driver_id', 'is', null);
if (stateError) throw new Error(`Cannot reset driver state references: ${stateError.code} ${stateError.message}`);

for (const [table, primaryKey] of [
  ['reward_records', 'id'],
  ['driver_location_events', 'id'],
  ['trips', 'id'],
  ['campaign_participations', 'id'],
  ['driver_offers', 'id'],
  ['model_outputs', 'id'],
  ['model_inputs', 'id'],
  ['campaigns', 'id'],
  ['proposals', 'id'],
  ['hotspots', 'id'],
  ['audit_logs', 'id'],
  ['supply_demand_snapshots', 'id'],
]) await deleteAll(table, primaryKey);

const capturedAt = new Date();
capturedAt.setUTCSeconds(0, 0);
capturedAt.setUTCMinutes(capturedAt.getUTCMinutes() - (capturedAt.getUTCMinutes() % 5));
const totalDemand = fixture.reduce((sum, row) => sum + row.demand_observed, 0);
const totalSupply = fixture.reduce((sum, row) => sum + row.idle_supply + row.enroute_supply, 0);
const { data: snapshot, error: snapshotError } = await db.from('supply_demand_snapshots').insert({
  captured_at: capturedAt.toISOString(),
  data_source: 'AI_PARQUET_DATASET',
  scenario_code: `${replay.regime.toUpperCase()}_AI_REPLAY`,
  total_demand: totalDemand,
  total_supply: totalSupply,
}).select('id,captured_at').single();
if (snapshotError) throw new Error(`Cannot seed AI snapshot: ${snapshotError.code} ${snapshotError.message}`);

const sourceName = `AI_PARQUET_REPLAY:${replay.source_at}`;
const { error: observationError } = await db.from('ai_zone_observations').insert(fixture.map((row) => ({
  snapshot_id: snapshot.id,
  zone_id: row.zone_id,
  demand_observed: row.demand_observed,
  idle_supply: row.idle_supply,
  enroute_supply: row.enroute_supply,
  rain_mm_h: row.rain_mm_h,
  rain_forecast_15: row.rain_forecast_15,
  rain_forecast_30: row.rain_forecast_30,
  peak_flag: row.peak_flag,
  holiday_flag: row.holiday_flag,
  data_status: 'live',
  source_name: sourceName,
  source_updated_at: capturedAt.toISOString(),
})));
if (observationError) throw new Error(`Cannot seed AI observations: ${observationError.code} ${observationError.message}`);

const { data: activeDrivers, error: driverError } = await db.from('profiles')
  .select('id,full_name')
  .eq('role', 'DRIVER')
  .eq('is_active', true)
  .order('created_at')
  .limit(80);
if (driverError) throw new Error(`Cannot load drivers: ${driverError.code} ${driverError.message}`);
const selectedDrivers = [...(activeDrivers ?? [])]
  .sort((left, right) => Number(right.full_name === 'GSM Test Driver') - Number(left.full_name === 'GSM Test Driver'))
  .slice(0, 60);
if (selectedDrivers.length < 40) {
  throw new Error(`At least 40 active drivers are required for the full AI scenario; found ${selectedDrivers.length}`);
}
const driverStateRows = selectedDrivers.map((driver, index) => {
  const zone = zoneRegistry[index % zoneRegistry.length];
  const offset = ((index % 5) - 2) * 0.0004;
  return {
    driver_id: driver.id,
    is_online: true,
    operational_status: 'IDLE',
    current_location: `POINT(${Number(zone.lng) + offset} ${Number(zone.lat) + offset})`,
    current_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    location_accuracy_m: 8 + (index % 6),
    location_source: 'TEST_FIXTURE',
    location_updated_at: capturedAt.toISOString(),
    updated_at: capturedAt.toISOString(),
  };
});
const { error: seededStateError } = await db.from('driver_states').upsert(driverStateRows, { onConflict: 'driver_id' });
if (seededStateError) throw new Error(`Cannot seed AI-ready driver states: ${seededStateError.code} ${seededStateError.message}`);

const countsAfter = {};
for (const table of affectedTables) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Cannot verify ${table}: ${error.code}`);
  countsAfter[table] = count;
}
console.log(JSON.stringify({
  mode: 'COMMIT',
  backupPath,
  backupSha256: backup.sha256,
  zoneRegistry: 'MATCH',
  dataset: replay.dataset,
  sourceAt: replay.source_at,
  regime: replay.regime,
  snapshot,
  totalDemand,
  totalSupply,
  onlineIdleDrivers: selectedDrivers.length,
  testDriverId: selectedDrivers.find((driver) => driver.full_name === 'GSM Test Driver')?.id ?? null,
  countsBefore,
  countsAfter,
}, null, 2));
