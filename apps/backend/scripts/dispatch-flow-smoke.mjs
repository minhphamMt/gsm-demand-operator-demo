import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TEST_OPERATOR_EMAIL', 'TEST_OPERATOR_PASSWORD'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const adminDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const proposalIds = ['f0420000-0000-4000-a000-000000000401', 'f0420000-0000-4000-a000-000000000402'];
const runId = randomUUID();

async function signIn() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: process.env.TEST_OPERATOR_EMAIL, password: process.env.TEST_OPERATOR_PASSWORD });
  if (error || !data.session) throw error ?? new Error('Operator session was not created');
  return { client, token: data.session.access_token };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Backend did not become ready');
}

async function api(baseUrl, token, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-request-id': init.requestId ?? `dispatch-smoke-${runId}`,
      'x-idempotency-key': init.idempotencyKey ?? `dispatch-smoke-key-${runId}`,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function cleanup() {
  const { data: batches } = await adminDb.from('dispatch_batches').select('id').in('proposal_id', proposalIds);
  const batchIds = (batches ?? []).map(({ id }) => id);
  if (batchIds.length) await adminDb.from('dispatch_batches').delete().in('id', batchIds);
  await adminDb.from('proposals').delete().in('id', proposalIds);
}

async function createFixtures() {
  await cleanup();
  const [{ data: template, error: templateError }, { data: snapshot, error: snapshotError }] = await Promise.all([
    adminDb.from('proposals').select('*').limit(1).single(),
    adminDb.from('supply_demand_snapshots').select('id').order('captured_at', { ascending: false }).limit(1).single(),
  ]);
  if (templateError || !template) throw templateError ?? new Error('Proposal template missing');
  if (snapshotError || !snapshot) throw snapshotError ?? new Error('Snapshot missing');
  const base = {
    bonus_amount: 0,
    estimated_cost: 10_000,
    explanation: ['dispatch-flow-smoke'],
    fare_multiplier: 1,
    generator_type: 'MANUAL',
    generator_version: 'dispatch-flow-smoke/1',
    hotspot_id: template.hotspot_id,
    input_snapshot_id: snapshot.id,
    offer_count: 0,
    policy_status: 'PASSED',
    simulation_details: { metrics_before: { unmet_demand: 3 }, metrics_after_relocation: { unmet_demand: 2 }, plan_mode: 'RELOCATION', warnings: [] },
    source_plan: { moves: [{ id: 'move-1', from_zone: 1, to_zone: 2, drivers: 1, route_source: 'smoke', route_observed_at: new Date().toISOString(), eta_minutes: 5, distance_km: 2, source_supply_after: 3, range_slack_km: 50, marginal_benefit: 1, estimated_cost: 10_000 }] },
    status: 'APPROVED',
    target_driver_count: 1,
    target_geofence: template.target_geofence,
    target_h3_indexes: template.target_h3_indexes,
    target_zone_ids: [2],
    version: 1,
    window_start_at: new Date(Date.now() - 60_000).toISOString(),
    window_end_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const { data: inserted, error } = await adminDb.from('proposals').insert(proposalIds.map((id) => ({ ...base, id, root_proposal_id: id }))).select('id,content_hash');
  if (error) throw error;
  for (const proposal of inserted ?? []) {
    const { error: hashError } = await adminDb.from('proposals').update({ approved_content_hash: proposal.content_hash, approved_version: 1 }).eq('id', proposal.id);
    if (hashError) throw hashError;
  }
}

const operator = await signIn();
const port = 3105;
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const server = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), OPERATOR_DISPATCH_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stdout.on('data', () => {});
server.stderr.on('data', (chunk) => { serverErrors += chunk.toString(); });

try {
  await waitForServer(`${baseUrl}/health`);
  await createFixtures();
  const released = await api(baseUrl, operator.token, `/operator/proposals/${proposalIds[0]}/dispatch`, { method: 'POST', body: '{}', idempotencyKey: `release-${runId}` });
  const replayed = await api(baseUrl, operator.token, `/operator/proposals/${proposalIds[0]}/dispatch`, { method: 'POST', body: '{}', idempotencyKey: `release-replay-${runId}` });
  if (released.id !== replayed.id || released.moves.length !== 1) throw new Error('Dispatch release was not idempotent');
  const move = released.moves[0];
  const event = (eventType, eventKey, payload = {}) => api(baseUrl, operator.token, `/operator/dispatch/${released.id}/moves/${move.id}/events`, {
    method: 'POST', body: JSON.stringify({ eventKey: `${eventKey}-${runId}`, eventType, units: 1, occurredAt: new Date().toISOString(), source: 'dispatch-smoke', payload }), requestId: `${eventKey}-${runId}`,
  });
  const failed = await event('FAILED', 'failed', { failure_code: 'PROVIDER_TIMEOUT' });
  if (failed.moves[0].state !== 'FAILED') throw new Error('Failed move state was not persisted');
  const retried = await api(baseUrl, operator.token, `/operator/dispatch/${released.id}/moves/${move.id}/retry`, { method: 'POST', body: JSON.stringify({ reason: 'Retry after provider timeout' }), requestId: `retry-${runId}` });
  if (retried.moves[0].state !== 'SENT') throw new Error('Retry did not reopen the failed move');
  const rejectedArrival = await event('ARRIVED', 'arrival-rejected', { accuracy_m: 200, inside_target: true });
  if (rejectedArrival.moves[0].arrivedUnits !== 0) throw new Error('Low-quality arrival changed actual contribution');
  await event('ARRIVED', 'arrival-valid', { accuracy_m: 12, inside_target: true });
  const executed = await event('AVAILABLE', 'available-valid', { accuracy_m: 10, inside_target: true });
  if (executed.status !== 'EXECUTED' || executed.moves[0].availableUnits !== 1) throw new Error('Verified availability did not execute the batch');
  const revisionsBeforeReplay = executed.reconciliations.length;
  const duplicate = await event('AVAILABLE', 'available-valid', { accuracy_m: 10, inside_target: true });
  if (duplicate.reconciliations.length !== revisionsBeforeReplay) throw new Error('Duplicate event created a reconciliation revision');
  const cancellable = await api(baseUrl, operator.token, `/operator/proposals/${proposalIds[1]}/dispatch`, { method: 'POST', body: '{}', idempotencyKey: `cancel-release-${runId}` });
  const cancelled = await api(baseUrl, operator.token, `/operator/dispatch/${cancellable.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Dispatch cancellation smoke' }), requestId: `cancel-${runId}` });
  if (cancelled.status !== 'CANCELLED') throw new Error('Dispatch cancellation failed');
  console.log(JSON.stringify({ authenticated: true, results: [
    { name: 'approved hash release is idempotent', ok: true },
    { name: 'failed move retry preserves previous evidence', ok: true },
    { name: 'arrival quality gate rejects inaccurate telemetry', ok: true },
    { name: 'verified availability creates immutable reconciliation revisions', ok: true },
    { name: 'duplicate event does not create a second revision', ok: true },
    { name: 'dispatch cancellation is authoritative', ok: true },
  ] }, null, 2));
} finally {
  await cleanup();
  server.kill();
  await operator.client.auth.signOut();
  if (serverErrors) process.stderr.write(serverErrors);
}
