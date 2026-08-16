import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TEST_OPERATOR_EMAIL', 'TEST_OPERATOR_PASSWORD', 'TEST_DRIVER_EMAIL', 'TEST_DRIVER_PASSWORD'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const adminDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const reviewProposalId = 'f0420000-0000-4000-a000-000000000301';
const activationProposalId = 'f0420000-0000-4000-a000-000000000302';
const rejectionProposalId = 'f0420000-0000-4000-a000-000000000303';
const revisionProposalId = 'f0420000-0000-4000-a000-000000000304';
const proposalIds = [reviewProposalId, activationProposalId, rejectionProposalId, revisionProposalId];
const runId = randomUUID();
const auditRequestIds = {
  activationPrimary: `audit-smoke-activation-primary-${runId}`,
  activationSecondary: `audit-smoke-activation-secondary-${runId}`,
  cancellation: `audit-smoke-cancellation-${runId}`,
  expiration: `audit-smoke-expiration-${runId}`,
  rejection: `audit-smoke-rejection-${runId}`,
  reviewPrimary: `audit-smoke-review-primary-${runId}`,
  reviewSecondary: `audit-smoke-review-secondary-${runId}`,
  revision: `audit-smoke-revision-${runId}`,
};
const idempotencyKeys = {
  primary: `audit-smoke-review-primary-key-${runId}`,
  rejection: `audit-smoke-rejection-key-${runId}`,
  secondary: `audit-smoke-review-secondary-key-${runId}`,
};
let revisionMove = { from_zone: 6, to_zone: 2, drivers: 1 };

async function signIn(email, password) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`No session returned for ${email}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The backend may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Backend did not become ready');
}

async function api(baseUrl, path, token, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-request-id': init.requestId ?? `security-smoke-${randomUUID()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  return {
    body,
    requestId: response.headers.get('x-request-id'),
    retryAfter: response.headers.get('retry-after-sensitive'),
    status: response.status,
  };
}

async function cleanupFixtures() {
  const { data: relatedProposals } = await adminDb.from('proposals').select('id').in('root_proposal_id', proposalIds);
  const relatedProposalIds = [...new Set([...proposalIds, ...(relatedProposals ?? []).map(({ id }) => id)])];
  const { data: campaigns } = await adminDb.from('campaigns').select('id').in('proposal_id', relatedProposalIds);
  const campaignIds = (campaigns ?? []).map(({ id }) => id);
  if (campaignIds.length) {
    const { data: offers } = await adminDb.from('driver_offers').select('id').in('campaign_id', campaignIds);
    const offerIds = (offers ?? []).map(({ id }) => id);
    await adminDb.from('budget_ledger_entries').delete().in('campaign_id', campaignIds);
    await adminDb.from('reward_records').delete().in('campaign_id', campaignIds);
    await adminDb.from('campaign_participations').delete().in('campaign_id', campaignIds);
    await adminDb.from('driver_offers').delete().in('campaign_id', campaignIds);
    await adminDb.from('campaigns').delete().in('id', campaignIds);
  }
  await adminDb.from('proposals').delete().in('id', relatedProposalIds);
  await adminDb.from('command_records').delete().in('idempotency_key', [
    auditRequestIds.reviewPrimary,
    auditRequestIds.reviewSecondary,
    idempotencyKeys.primary,
    idempotencyKeys.rejection,
    idempotencyKeys.secondary,
  ]);
}

async function createFixtures() {
  const [{ data: template, error: templateError }, { data: latestSnapshot, error: snapshotError }] = await Promise.all([
    adminDb.from('proposals').select('*').limit(1).single(),
    adminDb.from('supply_demand_snapshots').select('id').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).single(),
  ]);
  if (templateError || !template) throw templateError ?? new Error('No proposal template exists');
  if (snapshotError || !latestSnapshot) throw snapshotError ?? new Error('No supply-demand snapshot exists');
  const sourceCandidate = template.source_plan?.candidate_source_zones?.[0];
  const sourceZone = Number(sourceCandidate?.zone_id ?? String(sourceCandidate?.zoneId ?? '').match(/\d+/)?.[0] ?? 6);
  const sourceAvailable = Number(sourceCandidate?.available_supply ?? sourceCandidate?.availableSupply ?? sourceCandidate?.supply ?? 0);
  const targetZone = Number(template.target_zone_ids?.[0] ?? 2);
  revisionMove = {
    from_zone: sourceZone,
    to_zone: targetZone,
    // Keep the smoke valid even when the current template has no spare
    // relocation supply; the activation target still exercises revision.
    drivers: Number.isFinite(sourceAvailable) && sourceAvailable > 0 ? 1 : 0,
  };
  const common = {
    bonus_amount: 25_000,
    estimated_cost: 50_000,
    explanation: template.explanation,
    fare_multiplier: 1,
    generator_type: 'MANUAL',
    generator_version: 'security-concurrency-smoke/1',
    hotspot_id: template.hotspot_id,
    input_snapshot_id: latestSnapshot.id,
    offer_count: 0,
    policy_status: 'PASSED',
    simulation_details: {
      ...(template.simulation_details ?? {}),
      metrics_after_activation_expected: { unmet_demand: 1 },
      metrics_after_relocation: { unmet_demand: 2 },
      metrics_before: { unmet_demand: 4 },
      plan_mode: 'ACTIVATION_ONLY',
      warnings: [],
    },
    source_plan: {
      ...(template.source_plan ?? {}),
      moves: [revisionMove],
      residual_gap: [{ gap_remaining: 2, suggested_activation: 2, zone_id: targetZone }],
    },
    target_driver_count: 1,
    target_geofence: template.target_geofence,
    target_h3_indexes: template.target_h3_indexes,
    target_zone_ids: template.target_zone_ids?.length ? template.target_zone_ids : [2],
    version: 1,
    window_start_at: new Date(Date.now() - 60_000).toISOString(),
    window_end_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const { data: inserted, error } = await adminDb.from('proposals').insert([
    { ...common, id: reviewProposalId, root_proposal_id: reviewProposalId, status: 'UNDER_REVIEW' },
    { ...common, id: activationProposalId, root_proposal_id: activationProposalId, status: 'APPROVED', target_driver_count: 2, offer_count: 1 },
    { ...common, id: rejectionProposalId, root_proposal_id: rejectionProposalId, status: 'UNDER_REVIEW' },
    { ...common, id: revisionProposalId, root_proposal_id: revisionProposalId, status: 'UNDER_REVIEW' },
  ]).select('id,status,content_hash');
  if (error) throw error;
  for (const proposal of inserted ?? []) {
    if (proposal.status !== 'APPROVED') continue;
    const { error: approvalHashError } = await adminDb.from('proposals').update({
      approved_content_hash: proposal.content_hash,
      approved_version: 1,
    }).eq('id', proposal.id);
    if (approvalHashError) throw approvalHashError;
  }
}

async function expectForbidden(baseUrl, token, route) {
  const result = await api(baseUrl, route.path, token, {
    method: route.method,
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  });
  if (result.status !== 403 || result.body?.code !== 'FORBIDDEN' || !result.requestId) {
    throw new Error(`${route.method} ${route.path} was not forbidden: ${result.status} ${JSON.stringify(result.body)}`);
  }
}

const operatorOnlyRoutes = [
  { method: 'GET', path: '/api/v1/operator/ai/status' },
  { method: 'POST', path: '/api/v1/operator/ai/generate', body: { horizonMinutes: 15 } },
  { method: 'POST', path: '/api/v1/operator/ai/run-next', body: { horizonMinutes: 15 } },
  { method: 'GET', path: '/api/v1/operator/snapshots/latest' },
  { method: 'GET', path: '/api/v1/operator/baselines' },
  { method: 'GET', path: '/api/v1/operator/proposals' },
  { method: 'GET', path: `/api/v1/operator/proposals/${reviewProposalId}` },
  { method: 'POST', path: `/api/v1/operator/proposals/${reviewProposalId}/revisions`, body: {} },
  { method: 'POST', path: `/api/v1/operator/proposals/${reviewProposalId}/approve`, body: {} },
  { method: 'POST', path: `/api/v1/operator/proposals/${reviewProposalId}/reject`, body: {} },
  { method: 'POST', path: `/api/v1/operator/proposals/${activationProposalId}/activate`, body: {} },
  { method: 'GET', path: '/api/v1/operator/campaigns' },
  { method: 'GET', path: '/api/v1/operator/reports/operations' },
  { method: 'POST', path: `/api/v1/operator/campaigns/${activationProposalId}/cancel` },
  { method: 'GET', path: '/api/v1/operator/offers' },
  { method: 'GET', path: '/api/v1/operator/audit' },
  { method: 'GET', path: '/api/v1/drivers' },
  { method: 'GET', path: `/api/v1/drivers/${activationProposalId}` },
  { method: 'POST', path: `/api/v1/offers/${activationProposalId}/expire` },
];

const primary = await signIn(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
const driver = await signIn(process.env.TEST_DRIVER_EMAIL, process.env.TEST_DRIVER_PASSWORD);
const temporaryPassword = `Gsm!${randomUUID()}Aa1`;
const temporaryEmail = `gsm-security-${randomUUID()}@example.invalid`;
let temporaryUserId;
let secondary;
const port = 3104;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stdout.on('data', () => {});
server.stderr.on('data', (chunk) => { serverErrors += chunk.toString(); });

try {
  await waitForServer(`${baseUrl}/api/v1/health`);
  await cleanupFixtures();
  await createFixtures();

  const { data: created, error: createError } = await adminDb.auth.admin.createUser({
    email: temporaryEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: 'GSM Temporary Security Operator' },
  });
  if (createError || !created.user) throw createError ?? new Error('Temporary operator was not created');
  temporaryUserId = created.user.id;
  const { error: profileError } = await adminDb.from('profiles').upsert({
    id: temporaryUserId,
    role: 'OPERATOR',
    full_name: 'GSM Temporary Security Operator',
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;
  const { error: scopeError } = await adminDb.from('operator_scopes').insert({
    operator_id: temporaryUserId,
    market_code: 'HN',
    zone_ids: Array.from({ length: 30 }, (_, index) => index + 1),
    permissions: ['proposal.review', 'campaign.release', 'campaign.cancel', 'dispatch.release', 'scenario.compare', 'compensation.settle', 'audit.export'],
  });
  if (scopeError) throw scopeError;
  secondary = await signIn(temporaryEmail, temporaryPassword);

  await Promise.all(operatorOnlyRoutes.map((route) => expectForbidden(baseUrl, driver.token, route)));

  await adminDb.from('profiles').update({ is_active: false }).eq('id', temporaryUserId);
  const inactiveMutationRoutes = operatorOnlyRoutes.filter((route) => route.method !== 'GET' && !route.path.includes('/revisions') && !route.path.includes('/reject'));
  await Promise.all(inactiveMutationRoutes.map((route) => expectForbidden(baseUrl, secondary.token, route)));
  await adminDb.from('profiles').update({ is_active: true }).eq('id', temporaryUserId);

  const reviewAttempts = [
    {
      idempotencyKey: idempotencyKeys.primary,
      note: 'Primary concurrent approval',
      requestId: auditRequestIds.reviewPrimary,
      token: primary.token,
    },
    {
      idempotencyKey: idempotencyKeys.secondary,
      note: 'Secondary concurrent approval',
      requestId: auditRequestIds.reviewSecondary,
      token: secondary.token,
    },
  ];
  let reviewResults = await Promise.all(reviewAttempts.map((attempt) => api(
    baseUrl,
    `/api/v1/operator/proposals/${reviewProposalId}/approve`,
    attempt.token,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: 1, note: attempt.note }),
      headers: { 'x-idempotency-key': attempt.idempotencyKey },
      requestId: attempt.requestId,
    },
  )));
  // The overloaded free-tier gateway may time out before an RPC reaches the
  // database. Retry the exact logical command: the idempotency key makes this
  // either a safe result replay or a normal terminal-state conflict.
  reviewResults = await Promise.all(reviewResults.map((result, index) => {
    if (result.status !== 503) return result;
    const attempt = reviewAttempts[index];
    return api(baseUrl, `/api/v1/operator/proposals/${reviewProposalId}/approve`, attempt.token, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: 1, note: attempt.note }),
      headers: { 'x-idempotency-key': attempt.idempotencyKey },
      requestId: `${attempt.requestId}-retry`,
    });
  }));
  if (!reviewResults.some(({ status }) => status === 201) || reviewResults.some(({ status }) => ![201, 409].includes(status))) {
    throw new Error(`Concurrent approval was not serialized: ${JSON.stringify(reviewResults)}`);
  }

  const activationResults = await Promise.all([
    api(baseUrl, `/api/v1/operator/proposals/${activationProposalId}/activate`, primary.token, { method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: [driver.userId] }), requestId: auditRequestIds.activationPrimary }),
    api(baseUrl, `/api/v1/operator/proposals/${activationProposalId}/activate`, secondary.token, { method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: [driver.userId] }), requestId: auditRequestIds.activationSecondary }),
  ]);
  if (activationResults.filter(({ status }) => status === 201).length !== 1 || activationResults.filter(({ status }) => status === 409).length !== 1) {
    throw new Error(`Concurrent activation was not serialized: ${JSON.stringify(activationResults)}`);
  }

  const successfulReview = reviewResults.find(({ status }) => status === 201);
  const successfulActivation = activationResults.find(({ status }) => status === 201);
  const expectedReviewRequestId = successfulReview?.requestId;
  const expectedActivationRequestId = successfulActivation?.requestId;
  const campaignId = successfulActivation?.body?.id;
  const { data: offers, error: offersError } = await adminDb.from('driver_offers').select('id').eq('campaign_id', campaignId);
  if (offersError || offers?.length !== 1) throw offersError ?? new Error('Activation did not create the audit smoke offer');
  const expiration = await api(baseUrl, `/api/v1/offers/${offers[0].id}/expire`, primary.token, {
    method: 'POST', requestId: auditRequestIds.expiration,
  });
  if (expiration.status !== 201) throw new Error(`Offer expiration failed: ${JSON.stringify(expiration)}`);
  const cancellation = await api(baseUrl, `/api/v1/operator/campaigns/${campaignId}/cancel`, primary.token, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Security concurrency cancellation smoke', disposition: 'RELEASE_OPEN_ONLY', policyVersion: 'smoke-v1' }),
    requestId: auditRequestIds.cancellation,
  });
  if (cancellation.status !== 201) throw new Error(`Campaign cancellation failed: ${JSON.stringify(cancellation)}`);

  const rejection = await api(baseUrl, `/api/v1/operator/proposals/${rejectionProposalId}/reject`, primary.token, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion: 1, reasonCode: 'other', note: 'Audit rejection smoke' }),
    headers: { 'x-idempotency-key': idempotencyKeys.rejection },
    requestId: auditRequestIds.rejection,
  });
  if (rejection.status !== 201) throw new Error(`Proposal rejection failed: ${JSON.stringify(rejection)}`);
  const repeatedRejection = await api(baseUrl, `/api/v1/operator/proposals/${rejectionProposalId}/reject`, primary.token, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion: 1, reasonCode: 'other', note: 'Audit rejection smoke' }),
    headers: { 'x-idempotency-key': idempotencyKeys.rejection },
    requestId: `${auditRequestIds.rejection}-retry`,
  });
  if (repeatedRejection.status !== 201 || repeatedRejection.body?.status !== 'Rejected') {
    throw new Error(`Idempotent rejection retry did not replay the first result: ${JSON.stringify(repeatedRejection)}`);
  }
  const revision = await api(baseUrl, `/api/v1/operator/proposals/${revisionProposalId}/revisions`, primary.token, {
    method: 'POST',
    requestId: auditRequestIds.revision,
    body: JSON.stringify({
      expectedVersion: 1,
      sourcePlan: { moves: [revisionMove] },
      targetDriverCount: 1,
      campaignDurationMinutes: 15,
      bonusAmount: 0,
      zoneTripBonus: 0,
      fareMultiplier: 1,
      budgetLimit: 0,
      note: 'Audit revision smoke',
    }),
  });
  if (revision.status !== 201) throw new Error(`Proposal revision failed: ${JSON.stringify(revision)}`);

  const [{ data: campaigns }, { data: mutationAudits }] = await Promise.all([
    adminDb.from('campaigns').select('id').eq('proposal_id', activationProposalId),
    adminDb.from('audit_logs').select('actor_id,entity_id,action,before_data,after_data,metadata').in('metadata->>request_id', Object.values(auditRequestIds)),
  ]);
  const expectedAudits = [
    ['Approved', expectedReviewRequestId],
    ['ActivationStarted', expectedActivationRequestId],
    ['OfferExpired', auditRequestIds.expiration],
    ['CampaignCancelled', auditRequestIds.cancellation],
    ['Rejected', auditRequestIds.rejection],
    ['Revised', auditRequestIds.revision],
  ];
  if (campaigns?.length !== 1 || expectedAudits.some(([action, requestId]) => {
    const rows = mutationAudits?.filter((audit) => audit.action === action && audit.metadata?.request_id === requestId) ?? [];
    return rows.length !== 1 || !rows[0].actor_id || !rows[0].entity_id || !rows[0].before_data || !rows[0].after_data;
  })) {
    throw new Error(`Mutation audit context is incomplete: ${JSON.stringify(mutationAudits)}`);
  }

  let limitedResponse;
  for (let attempt = 1; attempt <= 12 && !limitedResponse; attempt += 1) {
    const result = await api(baseUrl, `/api/v1/operator/proposals/${reviewProposalId}/approve`, primary.token, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: 1, note: 'Safe terminal-state rate-limit smoke' }),
      requestId: `rate-limit-smoke-${attempt}`,
    });
    if (result.status === 429) limitedResponse = result;
    else if (result.status !== 409) throw new Error(`Unexpected pre-limit response: ${JSON.stringify(result)}`);
  }
  if (limitedResponse?.body?.code !== 'RATE_LIMITED'
    || limitedResponse.body.requestId !== limitedResponse.requestId
    || !/^rate-limit-smoke-\d+$/.test(limitedResponse.requestId ?? '')
    || !limitedResponse.retryAfter) {
    throw new Error(`Sensitive mutation did not return the stable 429 contract: ${JSON.stringify(limitedResponse)}`);
  }

  console.log(JSON.stringify({
    authenticated: true,
    results: [
      { name: `driver forbidden on all ${operatorOnlyRoutes.length} operator-only routes`, ok: true },
      { name: 'inactive operator forbidden on approve, activate, cancel, and expire', ok: true },
      { name: 'two active operators concurrently approve: one durable audit, then success replay or conflict after retry', ok: true },
      { name: 'two active operators concurrently activate: one campaign, one conflict', ok: true },
      { name: 'same idempotency key replays one rejection result without a second audit', ok: true },
      { name: 'approve, reject, revise, activate, expire, and cancel audits include request ID, actor, entity, before, and after', ok: true },
      { name: 'sensitive mutation rate limit returns 429/RATE_LIMITED with request ID and Retry-After', ok: true },
    ],
  }, null, 2));
} finally {
  await cleanupFixtures();
  if (temporaryUserId) {
    await adminDb.from('profiles').delete().eq('id', temporaryUserId);
    await adminDb.auth.admin.deleteUser(temporaryUserId);
  }
  server.kill();
  await Promise.allSettled([primary.client.auth.signOut(), driver.client.auth.signOut(), secondary?.client.auth.signOut()]);
  if (serverErrors) process.stderr.write(serverErrors);
}
