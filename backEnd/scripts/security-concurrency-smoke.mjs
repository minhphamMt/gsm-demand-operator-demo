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
const auditRequestIds = {
  activationPrimary: 'audit-smoke-activation-primary',
  activationSecondary: 'audit-smoke-activation-secondary',
  cancellation: 'audit-smoke-cancellation',
  expiration: 'audit-smoke-expiration',
  rejection: 'audit-smoke-rejection',
  reviewPrimary: 'audit-smoke-review-primary',
  reviewSecondary: 'audit-smoke-review-secondary',
  revision: 'audit-smoke-revision',
};
let revisionMove = { from_h3: 'source', to_h3: 'target', drivers: 1 };

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
    await adminDb.from('campaign_participations').delete().in('campaign_id', campaignIds);
    await adminDb.from('driver_offers').delete().in('campaign_id', campaignIds);
    await adminDb.from('campaigns').delete().in('id', campaignIds);
    await adminDb.from('audit_logs').delete().in('entity_id', [...campaignIds, ...offerIds]);
  }
  await adminDb.from('audit_logs').delete().in('entity_id', relatedProposalIds);
  await adminDb.from('proposals').delete().in('id', relatedProposalIds);
}

async function createFixtures() {
  const { data: template, error: templateError } = await adminDb.from('proposals').select('*').limit(1).single();
  if (templateError || !template) throw templateError ?? new Error('No proposal template exists');
  const sourceCandidate = template.source_plan?.candidate_source_zones?.[0];
  revisionMove = {
    from_h3: sourceCandidate?.zoneId ?? sourceCandidate?.zone_id ?? sourceCandidate?.h3_index ?? 'source',
    to_h3: template.target_h3_indexes?.[0] ?? 'target',
    drivers: 1,
  };
  const common = {
    bonus_amount: template.bonus_amount,
    estimated_cost: template.estimated_cost,
    explanation: template.explanation,
    fare_multiplier: template.fare_multiplier,
    generator_type: 'MANUAL',
    generator_version: 'security-concurrency-smoke/1',
    hotspot_id: template.hotspot_id,
    input_snapshot_id: template.input_snapshot_id,
    offer_count: 0,
    policy_status: 'PASSED',
    simulation_details: template.simulation_details,
    source_plan: template.source_plan,
    target_driver_count: 1,
    target_geofence: template.target_geofence,
    target_h3_indexes: template.target_h3_indexes,
    version: 1,
    window_start_at: new Date(Date.now() - 60_000).toISOString(),
    window_end_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const { error } = await adminDb.from('proposals').insert([
    { ...common, id: reviewProposalId, root_proposal_id: reviewProposalId, status: 'UNDER_REVIEW' },
    { ...common, id: activationProposalId, root_proposal_id: activationProposalId, status: 'APPROVED', target_driver_count: 2, offer_count: 1 },
    { ...common, id: rejectionProposalId, root_proposal_id: rejectionProposalId, status: 'UNDER_REVIEW' },
    { ...common, id: revisionProposalId, root_proposal_id: revisionProposalId, status: 'UNDER_REVIEW' },
  ]);
  if (error) throw error;
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
  secondary = await signIn(temporaryEmail, temporaryPassword);

  await Promise.all(operatorOnlyRoutes.map((route) => expectForbidden(baseUrl, driver.token, route)));

  await adminDb.from('profiles').update({ is_active: false }).eq('id', temporaryUserId);
  const inactiveMutationRoutes = operatorOnlyRoutes.filter((route) => route.method !== 'GET' && !route.path.includes('/revisions') && !route.path.includes('/reject'));
  await Promise.all(inactiveMutationRoutes.map((route) => expectForbidden(baseUrl, secondary.token, route)));
  await adminDb.from('profiles').update({ is_active: true }).eq('id', temporaryUserId);

  const reviewResults = await Promise.all([
    api(baseUrl, `/api/v1/operator/proposals/${reviewProposalId}/approve`, primary.token, { method: 'POST', body: JSON.stringify({ note: 'Primary concurrent approval' }), requestId: auditRequestIds.reviewPrimary }),
    api(baseUrl, `/api/v1/operator/proposals/${reviewProposalId}/approve`, secondary.token, { method: 'POST', body: JSON.stringify({ note: 'Secondary concurrent approval' }), requestId: auditRequestIds.reviewSecondary }),
  ]);
  if (reviewResults.filter(({ status }) => status === 201).length !== 1 || reviewResults.filter(({ status }) => status === 409).length !== 1) {
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
    method: 'POST', requestId: auditRequestIds.cancellation,
  });
  if (cancellation.status !== 201) throw new Error(`Campaign cancellation failed: ${JSON.stringify(cancellation)}`);

  const rejection = await api(baseUrl, `/api/v1/operator/proposals/${rejectionProposalId}/reject`, primary.token, {
    method: 'POST', body: JSON.stringify({ reasonCode: 'other', note: 'Audit rejection smoke' }), requestId: auditRequestIds.rejection,
  });
  if (rejection.status !== 201) throw new Error(`Proposal rejection failed: ${JSON.stringify(rejection)}`);
  const revision = await api(baseUrl, `/api/v1/operator/proposals/${revisionProposalId}/revisions`, primary.token, {
    method: 'POST',
    requestId: auditRequestIds.revision,
    body: JSON.stringify({
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
      body: JSON.stringify({ note: 'Safe terminal-state rate-limit smoke' }),
      requestId: `rate-limit-smoke-${attempt}`,
    });
    if (result.status === 429) limitedResponse = result;
    else if (result.status !== 409) throw new Error(`Unexpected pre-limit response: ${JSON.stringify(result)}`);
  }
  if (limitedResponse?.body?.code !== 'RATE_LIMITED'
    || limitedResponse.body.requestId !== limitedResponse.requestId
    || limitedResponse.requestId !== 'rate-limit-smoke-10'
    || !limitedResponse.retryAfter) {
    throw new Error(`Sensitive mutation did not return the stable 429 contract: ${JSON.stringify(limitedResponse)}`);
  }

  console.log(JSON.stringify({
    authenticated: true,
    results: [
      { name: `driver forbidden on all ${operatorOnlyRoutes.length} operator-only routes`, ok: true },
      { name: 'inactive operator forbidden on approve, activate, cancel, and expire', ok: true },
      { name: 'two active operators concurrently approve: one success, one conflict', ok: true },
      { name: 'two active operators concurrently activate: one campaign, one conflict', ok: true },
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
