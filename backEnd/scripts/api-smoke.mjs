import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_OPERATOR_EMAIL',
  'TEST_OPERATOR_PASSWORD',
  'TEST_DRIVER_EMAIL',
  'TEST_DRIVER_PASSWORD',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

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
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Backend did not become ready');
}

async function request(baseUrl, path, token, requestId, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...init.headers,
    },
  });
}

const [operator, driver] = await Promise.all([
  signIn(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD),
  signIn(process.env.TEST_DRIVER_EMAIL, process.env.TEST_DRIVER_PASSWORD),
]);
const adminDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const policyFixtureId = 'f0420000-0000-4000-a000-000000000101';
const staleFixtureId = 'f0420000-0000-4000-a000-000000000102';
const fixtureIds = [policyFixtureId, staleFixtureId];

async function cleanupReviewFixtures() {
  await adminDb.from('audit_logs').delete().in('entity_id', fixtureIds);
  await adminDb.from('proposals').delete().in('id', fixtureIds);
}

async function createReviewFixtures() {
  await cleanupReviewFixtures();
  const { data: template, error: templateError } = await adminDb.from('proposals').select('*').limit(1).single();
  if (templateError || !template) throw templateError ?? new Error('No proposal template exists');
  const base = {
    bonus_amount: template.bonus_amount,
    estimated_cost: template.estimated_cost,
    explanation: template.explanation,
    fare_multiplier: template.fare_multiplier,
    generator_type: 'MANUAL',
    generator_version: 'api-smoke/1',
    hotspot_id: template.hotspot_id,
    input_snapshot_id: template.input_snapshot_id,
    offer_count: template.offer_count,
    parent_proposal_id: null,
    simulation_details: template.simulation_details,
    source_plan: template.source_plan,
    status: 'UNDER_REVIEW',
    target_driver_count: template.target_driver_count,
    target_geofence: template.target_geofence,
    target_h3_indexes: template.target_h3_indexes,
    version: 1,
    window_start_at: new Date(Date.now() - 60_000).toISOString(),
  };
  const { error } = await adminDb.from('proposals').insert([
    {
      ...base,
      id: policyFixtureId,
      policy_status: 'FAILED',
      root_proposal_id: policyFixtureId,
      window_end_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    {
      ...base,
      id: staleFixtureId,
      policy_status: 'PASSED',
      root_proposal_id: staleFixtureId,
      window_end_at: new Date(Date.now() - 1_000).toISOString(),
    },
  ]);
  if (error) throw error;
}

const port = 3102;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverErrors = '';
server.stdout.on('data', () => {
  // Drain Nest request logs so the child process cannot block on a full pipe.
});
server.stderr.on('data', (chunk) => {
  serverErrors += chunk.toString();
});

try {
  await waitForServer(`${baseUrl}/api/v1/health`);
  await createReviewFixtures();
  const conflictCandidatesResponse = await request(baseUrl, '/api/v1/operator/proposals', operator.token);
  const conflictCandidates = await conflictCandidatesResponse.json();
  const conflictCandidate = conflictCandidates.find((proposal) => !['Generated', 'UnderReview'].includes(proposal.status));
  if (!conflictCandidate) throw new Error('No terminal proposal exists for the read-only conflict smoke test');
  const campaignResponse = await request(baseUrl, '/api/v1/operator/campaigns', operator.token);
  const campaignRows = await campaignResponse.json();
  const duplicateActivation = campaignRows.find((campaign) => campaign.planId === conflictCandidate.id);
  if (!duplicateActivation) throw new Error('No existing campaign exists for the duplicate-activation smoke test');
  const validRevisionBody = {
    sourcePlan: { moves: [{ from_h3: 'source', to_h3: 'target', drivers: 1 }] },
    targetDriverCount: 1,
    campaignDurationMinutes: 15,
    bonusAmount: 0,
    zoneTripBonus: 0,
    fareMultiplier: 1,
    budgetLimit: 0,
    note: 'Read-only workflow conflict smoke test',
  };
  const cases = [
    ['public health', await request(baseUrl, '/api/v1/health'), 200],
    ['database readiness', await request(baseUrl, '/api/v1/health/ready'), 200],
    ['production metrics', await request(baseUrl, '/api/v1/health/metrics'), 200],
    ['missing token rejected', await request(baseUrl, '/api/v1/operator/proposals', undefined, 'smoke-missing-token'), 401],
    [
      'operator proposal access',
      await request(baseUrl, '/api/v1/operator/proposals', operator.token),
      200,
    ],
    [
      'operator proposal not found contract',
      await request(baseUrl, '/api/v1/operator/proposals/11111111-1111-4111-8111-111111111111', operator.token, 'smoke-not-found'),
      404,
    ],
    [
      'operator revision field validation',
      await request(
        baseUrl,
        '/api/v1/operator/proposals/11111111-1111-4111-8111-111111111111/revisions',
        operator.token,
        'smoke-revision-validation',
        {
          method: 'POST',
          body: JSON.stringify({
            sourcePlan: { moves: [{ from_h3: '', to_h3: '', drivers: -1 }] },
            targetDriverCount: 0,
            campaignDurationMinutes: 1,
            bonusAmount: -1,
            zoneTripBonus: -1,
            fareMultiplier: 0,
            budgetLimit: -1,
          }),
        },
      ),
      422,
    ],
    [
      'operator concurrent review conflict',
      await request(
        baseUrl,
        `/api/v1/operator/proposals/${conflictCandidate.id}/approve`,
        operator.token,
        'smoke-review-conflict',
        { method: 'POST', body: JSON.stringify({ note: 'Read-only conflict smoke test' }) },
      ),
      409,
    ],
    [
      'operator concurrent revision conflict',
      await request(
        baseUrl,
        `/api/v1/operator/proposals/${conflictCandidate.id}/revisions`,
        operator.token,
        'smoke-revision-conflict',
        { method: 'POST', body: JSON.stringify(validRevisionBody) },
      ),
      409,
    ],
    [
      'operator policy bypass rejected',
      await request(
        baseUrl,
        `/api/v1/operator/proposals/${policyFixtureId}/approve`,
        operator.token,
        'smoke-policy-rejected',
        { method: 'POST', body: JSON.stringify({ note: 'Must not be approved' }) },
      ),
      422,
    ],
    [
      'operator stale approval rejected',
      await request(
        baseUrl,
        `/api/v1/operator/proposals/${staleFixtureId}/approve`,
        operator.token,
        'smoke-stale-rejected',
        { method: 'POST', body: JSON.stringify({ note: 'Must not be approved' }) },
      ),
      409,
    ],
    [
      'operator duplicate activation rejected',
      await request(
        baseUrl,
        `/api/v1/operator/proposals/${conflictCandidate.id}/activate`,
        operator.token,
        'smoke-duplicate-activation',
        { method: 'POST', body: JSON.stringify({ responseMode: 'human' }) },
      ),
      409,
    ],
    [
      'operator rejection field validation',
      await request(
        baseUrl,
        '/api/v1/operator/proposals/11111111-1111-4111-8111-111111111111/reject',
        operator.token,
        'smoke-rejection-validation',
        { method: 'POST', body: JSON.stringify({ reasonCode: 'unknown', note: '' }) },
      ),
      422,
    ],
    [
      'operator GeoJSON snapshot',
      await request(baseUrl, '/api/v1/operator/snapshots/latest', operator.token),
      200,
    ],
    [
      'operator snapshot time window',
      await request(baseUrl, '/api/v1/operator/snapshots?from=2020-01-01T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A00.000Z&limit=2', operator.token),
      200,
    ],
    [
      'operator snapshot time window validation',
      await request(baseUrl, '/api/v1/operator/snapshots?from=2030-01-01T00%3A00%3A00.000Z&to=2020-01-01T00%3A00%3A00.000Z', operator.token),
      422,
    ],
    [
      'operator campaigns',
      await request(baseUrl, '/api/v1/operator/campaigns', operator.token),
      200,
    ],
    [
      'operator DB-ledger report',
      await request(baseUrl, '/api/v1/operator/reports/operations?from=2020-01-01T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A00.000Z', operator.token),
      200,
    ],
    [
      'operator campaign report filter',
      await request(baseUrl, `/api/v1/operator/reports/operations?campaignId=${duplicateActivation.id}`, operator.token),
      200,
    ],
    [
      'operator report date validation',
      await request(baseUrl, '/api/v1/operator/reports/operations?from=2030-01-01T00%3A00%3A00.000Z&to=2020-01-01T00%3A00%3A00.000Z', operator.token),
      422,
    ],
    [
      'operator paginated audit',
      await request(baseUrl, '/api/v1/operator/audit?page=1&pageSize=1', operator.token),
      200,
    ],
    [
      'operator filtered audit',
      await request(baseUrl, `/api/v1/operator/audit?entityId=${conflictCandidate.id}&pageSize=10`, operator.token),
      200,
    ],
    [
      'operator audit action actor date filters',
      await request(baseUrl, '/api/v1/operator/audit?action=Approved&actorType=OPERATOR&entityType=proposal&from=2020-01-01T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A00.000Z&pageSize=10', operator.token),
      200,
    ],
    [
      'operator audit query validation',
      await request(baseUrl, '/api/v1/operator/audit?page=0&pageSize=101', operator.token, 'smoke-audit-validation'),
      422,
    ],
    [
      'operator audit date validation',
      await request(baseUrl, '/api/v1/operator/audit?from=2030-01-01T00%3A00%3A00.000Z&to=2020-01-01T00%3A00%3A00.000Z', operator.token, 'smoke-audit-date-validation'),
      422,
    ],
    [
      'operator baselines',
      await request(baseUrl, '/api/v1/operator/baselines', operator.token),
      200,
    ],
    ['operator identity', await request(baseUrl, '/api/v1/auth/me', operator.token), 200],
    ['operator driver access', await request(baseUrl, '/api/v1/drivers', operator.token), 200],
    ['driver self access', await request(baseUrl, '/api/v1/driver/me', driver.token), 200],
    ['driver identity', await request(baseUrl, '/api/v1/auth/me', driver.token), 200],
    [
      'driver operator access rejected',
      await request(baseUrl, '/api/v1/operator/proposals', driver.token),
      403,
    ],
    ['swagger operator contract', await request(baseUrl, '/docs-json'), 200],
  ];

  const results = [];
  for (const [name, response, expected] of cases) {
    const body = await response.json().catch(() => null);
    const ok = response.status === expected;
    results.push({ name, ok, status: response.status, expected });
    if (!ok) throw new Error(`${name}: expected ${expected}, got ${response.status}: ${JSON.stringify(body)}`);
    const responseRequestId = response.headers.get('x-request-id');
    if (name !== 'swagger operator contract' && !responseRequestId) {
      throw new Error(`${name}: response did not include x-request-id`);
    }
    if (expected >= 400 && (
      typeof body?.code !== 'string'
      || typeof body?.message !== 'string'
      || body?.requestId !== responseRequestId
    )) {
      throw new Error(`${name}: response did not use the stable error envelope`);
    }
    if (name === 'missing token rejected' && responseRequestId !== 'smoke-missing-token') {
      throw new Error('Safe caller request ID was not preserved');
    }
    if (name === 'operator proposal not found contract' && body?.code !== 'NOT_FOUND') {
      throw new Error('Missing proposal did not return the NOT_FOUND contract');
    }
    if (name === 'operator revision field validation') {
      const fields = body?.details?.fieldErrors;
      const expectedFields = ['sourcePlan.moves.0.drivers', 'targetDriverCount', 'campaignDurationMinutes', 'bonusAmount', 'zoneTripBonus', 'fareMultiplier', 'budgetLimit'];
      if (body?.code !== 'VALIDATION_ERROR' || expectedFields.some((field) => typeof fields?.[field] !== 'string')) {
        throw new Error(`Revision validation did not return field errors: ${JSON.stringify(body)}`);
      }
    }
    if (name === 'operator concurrent review conflict' && body?.code !== 'PROPOSAL_VERSION_CONFLICT') {
      throw new Error(`Concurrent review did not return a stable conflict: ${JSON.stringify(body)}`);
    }
    if (name === 'operator concurrent revision conflict' && body?.code !== 'PROPOSAL_VERSION_CONFLICT') {
      throw new Error(`Concurrent revision did not return a stable conflict: ${JSON.stringify(body)}`);
    }
    if (name === 'operator policy bypass rejected' && body?.code !== 'POLICY_CHECK_FAILED') {
      throw new Error(`Policy bypass did not return the expected validation code: ${JSON.stringify(body)}`);
    }
    if (name === 'operator stale approval rejected' && body?.code !== 'STALE_PROPOSAL') {
      throw new Error(`Stale approval did not return the expected conflict code: ${JSON.stringify(body)}`);
    }
    if (name === 'operator duplicate activation rejected' && body?.code !== 'CONFLICT') {
      throw new Error(`Duplicate activation did not return a conflict: ${JSON.stringify(body)}`);
    }
    if (name === 'operator rejection field validation') {
      const fields = body?.details?.fieldErrors;
      if (body?.code !== 'VALIDATION_ERROR' || typeof fields?.reasonCode !== 'string' || typeof fields?.note !== 'string') {
        throw new Error(`Rejection validation did not return required field errors: ${JSON.stringify(body)}`);
      }
    }
    if (name === 'swagger operator contract') {
      const proposalPath = body?.paths?.['/api/v1/operator/proposals/{id}'];
      const schemas = body?.components?.schemas;
      if (!proposalPath?.get?.responses?.['404'] || !schemas?.ProposalResponseDto || !schemas?.ApiErrorDto) {
        throw new Error(`Swagger JSON is missing operator response or error contracts: ${JSON.stringify({ has404: Boolean(proposalPath?.get?.responses?.['404']), hasProposal: Boolean(schemas?.ProposalResponseDto), hasApiError: Boolean(schemas?.ApiErrorDto) })}`);
      }
    }
    if (name === 'driver self access' && body?.driver?.id !== driver.userId) {
      throw new Error('Driver self endpoint returned another driver');
    }
    if (name === 'operator identity' && body?.role !== 'OPERATOR') {
      throw new Error('Operator identity endpoint returned the wrong role');
    }
    if (name === 'driver identity' && body?.role !== 'DRIVER') {
      throw new Error('Driver identity endpoint returned the wrong role');
    }
    if (name === 'operator GeoJSON snapshot') {
      const zone = body?.zones?.[0];
      if (!zone || !Array.isArray(zone.center) || !Array.isArray(zone.boundary)) {
        throw new Error('Snapshot endpoint did not return coordinate arrays');
      }
    }
    if (name === 'operator campaigns') {
      const validStatuses = new Set(['Draft', 'Active', 'TargetReached', 'Completed', 'Cancelled', 'BudgetExhausted']);
      if (!Array.isArray(body) || body.some((campaign) => !validStatuses.has(campaign.status))) {
        throw new Error('Campaign endpoint returned a status outside the database lifecycle');
      }
    }
    if (name === 'operator DB-ledger report') {
      const totals = body?.campaigns?.reduce((sum, campaign) => ({
        campaigns: sum.campaigns + 1,
        qualifiedTrips: sum.qualifiedTrips + campaign.qualifiedTrips,
        rewardPaidVnd: sum.rewardPaidVnd + campaign.rewardPaidVnd,
        budgetUsedVnd: sum.budgetUsedVnd + campaign.budgetUsedVnd,
      }), { campaigns: 0, qualifiedTrips: 0, rewardPaidVnd: 0, budgetUsedVnd: 0 });
      if (body?.dataMode !== 'DB_LEDGER' || body?.summary?.netCostVnd !== null || body?.sources?.netCostVnd !== null
        || !totals || totals.campaigns !== body.summary.campaigns || totals.qualifiedTrips !== body.summary.qualifiedTrips
        || totals.rewardPaidVnd !== body.summary.rewardPaidVnd || totals.budgetUsedVnd !== body.summary.budgetUsedVnd) {
        throw new Error(`Operations report did not reconcile to campaign rows: ${JSON.stringify(body)}`);
      }
    }
    if (name === 'operator campaign report filter' && (body?.campaigns?.length !== 1 || body.campaigns[0].id !== duplicateActivation.id)) {
      throw new Error(`Operations report campaign filter leaked another campaign: ${JSON.stringify(body)}`);
    }
    if (name === 'operator report date validation' && body?.code !== 'UNPROCESSABLE_ENTITY') {
      throw new Error(`Report date range validation returned an unstable error: ${JSON.stringify(body)}`);
    }
    if (name === 'operator paginated audit') {
      if (!Array.isArray(body?.items) || body.page !== 1 || body.pageSize !== 1 || typeof body.total !== 'number' || body.items.length > 1) {
        throw new Error(`Audit endpoint returned invalid pagination metadata: ${JSON.stringify(body)}`);
      }
    }
    if (name === 'operator filtered audit' && body?.items?.some((entry) => entry.planId !== conflictCandidate.id && entry.entityId !== conflictCandidate.id)) {
      throw new Error(`Audit entity filter returned another workflow: ${JSON.stringify(body)}`);
    }
    if (name === 'operator audit action actor date filters' && (!body?.items?.length || body.items.some((entry) => entry.action !== 'Approved' || entry.actorType !== 'OPERATOR' || entry.entityType !== 'proposal'))) {
      throw new Error(`Audit action/actor/date filters returned invalid rows: ${JSON.stringify(body)}`);
    }
    if (name === 'operator audit query validation' && body?.code !== 'VALIDATION_ERROR') {
      throw new Error(`Audit query validation returned an unstable error: ${JSON.stringify(body)}`);
    }
    if (name === 'operator audit date validation' && body?.code !== 'UNPROCESSABLE_ENTITY') {
      throw new Error(`Audit date range validation returned an unstable error: ${JSON.stringify(body)}`);
    }
    if (name === 'operator baselines') {
      if (!Array.isArray(body) || body.length !== 2 || body.some((baseline) => typeof baseline.fulfillmentRate !== 'number')) {
        throw new Error('Baseline endpoint returned an invalid live baseline contract');
      }
    }
  }
  const [{ data: fixtures }, { data: fixtureAudit }] = await Promise.all([
    adminDb.from('proposals').select('id,status').in('id', fixtureIds),
    adminDb.from('audit_logs').select('id').in('entity_id', fixtureIds),
  ]);
  if (fixtures?.some((proposal) => proposal.status !== 'UNDER_REVIEW') || fixtureAudit?.length) {
    throw new Error('A rejected operator workflow changed fixture state or wrote audit data');
  }
  console.log(JSON.stringify({ authenticated: true, results }, null, 2));
} finally {
  await cleanupReviewFixtures();
  server.kill();
  await Promise.allSettled([operator.client.auth.signOut(), driver.client.auth.signOut()]);
  if (serverErrors) process.stderr.write(serverErrors);
}
