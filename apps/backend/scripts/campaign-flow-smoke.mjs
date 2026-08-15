import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'TEST_OPERATOR_EMAIL', 'TEST_OPERATOR_PASSWORD', 'TEST_DRIVER_EMAIL', 'TEST_DRIVER_PASSWORD'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const adminDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const cancelProposalId = 'f0420000-0000-4000-a000-000000000201';
const targetProposalId = 'f0420000-0000-4000-a000-000000000202';
const budgetProposalId = 'f0420000-0000-4000-a000-000000000203';
const completedProposalId = 'f0420000-0000-4000-a000-000000000204';
const proposalIds = [cancelProposalId, targetProposalId, budgetProposalId, completedProposalId];
const runId = Date.now().toString(36);
const requestIds = {
  driverStatus: `audit-smoke-driver-status-${runId}`,
  acceptCancel: `audit-smoke-offer-accept-cancel-${runId}`,
  declineBudget: `audit-smoke-offer-decline-budget-${runId}`,
  budgetLifecycle: `campaign-smoke-budget-${runId}`,
  completedLifecycle: `campaign-smoke-completed-${runId}`,
  acceptTarget: `audit-smoke-offer-accept-target-${runId}`,
};

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
      'x-request-id': init.requestId ?? `campaign-smoke-${Date.now()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function fixtureEntityIds() {
  const { data: campaigns } = await adminDb.from('campaigns').select('id').in('proposal_id', proposalIds);
  const campaignIds = (campaigns ?? []).map(({ id }) => id);
  if (!campaignIds.length) return { campaignIds, entityIds: [...proposalIds] };
  const { data: offers } = await adminDb.from('driver_offers').select('id').in('campaign_id', campaignIds);
  return { campaignIds, entityIds: [...proposalIds, ...campaignIds, ...(offers ?? []).map(({ id }) => id)] };
}

async function cleanupFixtures(driverId, previousDriverState) {
  const { campaignIds } = await fixtureEntityIds();
  if (campaignIds.length) {
    await adminDb.from('driver_states').update({
      active_campaign_id: previousDriverState?.active_campaign_id ?? null,
      is_online: previousDriverState?.is_online ?? false,
      operational_status: previousDriverState?.operational_status ?? 'OFFLINE',
    }).eq('driver_id', driverId);
    await adminDb.from('budget_ledger_entries').delete().in('campaign_id', campaignIds);
    await adminDb.from('reward_records').delete().in('campaign_id', campaignIds);
    await adminDb.from('campaign_participations').delete().in('campaign_id', campaignIds);
    await adminDb.from('driver_offers').delete().in('campaign_id', campaignIds);
    await adminDb.from('campaigns').delete().in('id', campaignIds);
  }
  await adminDb.from('proposals').delete().in('id', proposalIds);
}

async function createFixtures() {
  const [{ data: template, error: templateError }, { data: latestSnapshot, error: snapshotError }] = await Promise.all([
    adminDb.from('proposals').select('*').limit(1).single(),
    adminDb.from('supply_demand_snapshots').select('id').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).single(),
  ]);
  if (templateError || !template) throw templateError ?? new Error('No proposal template exists');
  if (snapshotError || !latestSnapshot) throw snapshotError ?? new Error('No supply-demand snapshot exists');
  const common = {
    bonus_amount: 25_000,
    estimated_cost: 100_000,
    explanation: template.explanation,
    fare_multiplier: 1,
    generator_type: 'MANUAL',
    generator_version: 'campaign-flow-smoke/1',
    hotspot_id: template.hotspot_id,
    // Use the current snapshot so activation tests are not rejected as stale
    // solely because the chosen template originated from an older model run.
    input_snapshot_id: latestSnapshot.id,
    policy_status: 'PASSED',
    simulation_details: {
      ...(template.simulation_details ?? {}),
      metrics_after_activation_expected: { unmet_demand: 1 },
      metrics_after_relocation: { unmet_demand: 4 },
      metrics_before: { unmet_demand: 4 },
      plan_mode: 'ACTIVATION_ONLY',
      warnings: [],
    },
    source_plan: {
      ...(template.source_plan ?? {}),
      moves: [],
      residual_gap: [{ gap_remaining: 4, suggested_activation: 4, zone_id: 2 }],
    },
    status: 'APPROVED',
    target_geofence: template.target_geofence,
    target_h3_indexes: template.target_h3_indexes,
    target_zone_ids: template.target_zone_ids?.length ? template.target_zone_ids : [2],
    version: 1,
    window_start_at: new Date(Date.now() - 60_000).toISOString(),
    window_end_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const { data: inserted, error } = await adminDb.from('proposals').insert([
    { ...common, id: cancelProposalId, root_proposal_id: cancelProposalId, target_driver_count: 2, offer_count: 1 },
    { ...common, id: targetProposalId, root_proposal_id: targetProposalId, target_driver_count: 1, offer_count: 2 },
    { ...common, id: budgetProposalId, root_proposal_id: budgetProposalId, target_driver_count: 1, offer_count: 1 },
    { ...common, id: completedProposalId, root_proposal_id: completedProposalId, target_driver_count: 1, offer_count: 1 },
  ]).select('id,status,content_hash');
  if (error) throw error;
  for (const proposal of inserted ?? []) {
    const { error: approvalHashError } = await adminDb.from('proposals').update({
      approved_content_hash: proposal.content_hash,
      approved_version: 1,
    }).eq('id', proposal.id);
    if (approvalHashError) throw approvalHashError;
  }
}

const [operator, driver] = await Promise.all([
  signIn(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD),
  signIn(process.env.TEST_DRIVER_EMAIL, process.env.TEST_DRIVER_PASSWORD),
]);
const { data: previousDriverState, error: driverStateError } = await adminDb.from('driver_states').select('active_campaign_id,is_online,operational_status').eq('driver_id', driver.userId).single();
if (driverStateError || !previousDriverState) throw driverStateError ?? new Error('Test driver state is missing');
if (previousDriverState.active_campaign_id) throw new Error('Test driver already has an active campaign');

const port = 3103;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stdout.on('data', () => {
  // Drain Nest request logs so the child process cannot block on a full pipe.
});
server.stderr.on('data', (chunk) => { serverErrors += chunk.toString(); });

try {
  await waitForServer(`${baseUrl}/api/v1/health`);
  await cleanupFixtures(driver.userId, previousDriverState);
  await createFixtures();

  await api(baseUrl, `/api/v1/drivers/${driver.userId}/status`, driver.token, {
    method: 'PATCH',
    body: JSON.stringify({ status: previousDriverState.is_online ? 'offline' : 'online_idle' }),
    requestId: requestIds.driverStatus,
  });
  const { data: driverStatusAudit } = await adminDb.from('audit_logs')
    .select('actor_id,entity_id,before_data,after_data,metadata')
    .eq('entity_id', driver.userId)
    .eq('action', 'DriverStatusChanged')
    .eq('metadata->>request_id', requestIds.driverStatus);
  if (driverStatusAudit?.length !== 1 || driverStatusAudit[0].actor_id !== driver.userId
    || !driverStatusAudit[0].before_data || !driverStatusAudit[0].after_data) {
    throw new Error(`Driver status audit context is incomplete: ${JSON.stringify(driverStatusAudit)}`);
  }

  const cancelCampaign = await api(baseUrl, `/api/v1/operator/proposals/${cancelProposalId}/activate`, operator.token, {
    method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: [driver.userId] }),
  });
  if (cancelCampaign.status !== 'Active') throw new Error(`Cancel flow did not activate: ${cancelCampaign.status}`);
  const [cancelOffer] = await api(baseUrl, `/api/v1/operator/offers?campaignId=${cancelCampaign.id}`, operator.token);
  if (!cancelOffer || cancelOffer.status !== 'Open') throw new Error('Cancel flow did not create an open offer');
  const acceptedCancelOffer = await api(baseUrl, `/api/v1/driver/offers/${cancelOffer.id}/accept`, driver.token, {
    method: 'POST', requestId: requestIds.acceptCancel,
  });
  if (acceptedCancelOffer?.participation?.status !== 'ACCEPTED'
    || acceptedCancelOffer?.navigation_target?.type !== 'Point'
    || !Array.isArray(acceptedCancelOffer?.navigation_target?.coordinates)) {
    throw new Error(`Driver accept adapter returned an invalid contract: ${JSON.stringify(acceptedCancelOffer)}`);
  }
  const cancelled = await api(baseUrl, `/api/v1/operator/campaigns/${cancelCampaign.id}/cancel`, operator.token, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Campaign flow cancellation smoke', disposition: 'RELEASE_OPEN_AND_COMPENSATE_ACCEPTED', policyVersion: 'smoke-v1' }),
  });
  if (cancelled.status !== 'Cancelled' || cancelled.cancelled !== 1) throw new Error(`Cancellation result is incorrect: ${JSON.stringify(cancelled)}`);
  const { data: releasedParticipation } = await adminDb.from('campaign_participations').select('status').eq('campaign_id', cancelCampaign.id).single();
  const { data: releasedDriver } = await adminDb.from('driver_states').select('active_campaign_id,operational_status').eq('driver_id', driver.userId).single();
  if (releasedParticipation?.status !== 'CANCELLED_AFTER_ACCEPT' || releasedDriver?.active_campaign_id) throw new Error('Cancellation did not release accepted participation and driver');

  const budgetCampaign = await api(baseUrl, `/api/v1/operator/proposals/${budgetProposalId}/activate`, operator.token, {
    method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: [driver.userId] }),
  });
  const [budgetOffer] = await api(baseUrl, `/api/v1/operator/offers?campaignId=${budgetCampaign.id}`, operator.token);
  const declinedBudgetOffer = await api(baseUrl, `/api/v1/driver/offers/${budgetOffer.id}/decline`, driver.token, {
    method: 'POST', requestId: requestIds.declineBudget,
  });
  if (declinedBudgetOffer?.offer_id !== budgetOffer.id || declinedBudgetOffer?.status !== 'DECLINED') {
    throw new Error(`Driver decline adapter returned an invalid contract: ${JSON.stringify(declinedBudgetOffer)}`);
  }
  const [operatorVisibleDecline] = await api(baseUrl, `/api/v1/operator/offers?campaignId=${budgetCampaign.id}`, operator.token);
  if (operatorVisibleDecline?.status !== 'Declined') {
    throw new Error(`Operator did not observe the driver decline: ${JSON.stringify(operatorVisibleDecline)}`);
  }
  await adminDb.from('campaigns').update({ budget_used: budgetCampaign.budgetLimit }).eq('id', budgetCampaign.id);
  const { error: budgetReconcileError } = await adminDb.rpc('reconcile_campaign_lifecycle', { p_request_id: requestIds.budgetLifecycle });
  if (budgetReconcileError) throw budgetReconcileError;
  const [{ data: exhaustedCampaign }, { data: exhaustedOffers }, { data: exhaustedAudit }] = await Promise.all([
    adminDb.from('campaigns').select('status').eq('id', budgetCampaign.id).single(),
    adminDb.from('driver_offers').select('status').eq('campaign_id', budgetCampaign.id),
    adminDb.from('audit_logs').select('actor_type,before_data,after_data,metadata').eq('entity_id', budgetCampaign.id).eq('action', 'CampaignBudgetExhausted'),
  ]);
  if (exhaustedCampaign?.status !== 'BUDGET_EXHAUSTED' || exhaustedOffers?.some(({ status }) => ['SENT', 'ACCEPTED'].includes(status))
    || exhaustedAudit?.length !== 1 || exhaustedAudit[0].actor_type !== 'SYSTEM'
    || exhaustedAudit[0].metadata?.request_id !== requestIds.budgetLifecycle) {
    throw new Error('Budget exhaustion reconciliation is incomplete');
  }

  const completedCampaign = await api(baseUrl, `/api/v1/operator/proposals/${completedProposalId}/activate`, operator.token, {
    method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: [driver.userId] }),
  });
  await adminDb.from('campaigns').update({ end_at: new Date(Date.now() - 1_000).toISOString() }).eq('id', completedCampaign.id);
  const { error: completedReconcileError } = await adminDb.rpc('reconcile_campaign_lifecycle', { p_request_id: requestIds.completedLifecycle });
  if (completedReconcileError) throw completedReconcileError;
  const [{ data: completedRow }, { data: completedOffers }, { data: completedAudit }] = await Promise.all([
    adminDb.from('campaigns').select('status').eq('id', completedCampaign.id).single(),
    adminDb.from('driver_offers').select('status').eq('campaign_id', completedCampaign.id),
    adminDb.from('audit_logs').select('actor_type,metadata').eq('entity_id', completedCampaign.id).eq('action', 'CampaignCompleted'),
  ]);
  if (completedRow?.status !== 'COMPLETED' || completedOffers?.some(({ status }) => status !== 'EXPIRED')
    || completedAudit?.length !== 1 || completedAudit[0].actor_type !== 'SYSTEM'
    || completedAudit[0].metadata?.request_id !== requestIds.completedLifecycle) {
    throw new Error('End-time reconciliation is incomplete');
  }

  const { data: otherDrivers } = await adminDb.from('profiles').select('id').eq('role', 'DRIVER').eq('is_active', true).neq('id', driver.userId).limit(1);
  const targetDriverIds = [driver.userId, ...(otherDrivers ?? []).map(({ id }) => id)];
  const targetCampaign = await api(baseUrl, `/api/v1/operator/proposals/${targetProposalId}/activate`, operator.token, {
    method: 'POST', body: JSON.stringify({ responseMode: 'human', driverIds: targetDriverIds }),
  });
  const targetOffers = await api(baseUrl, `/api/v1/operator/offers?campaignId=${targetCampaign.id}`, operator.token);
  const acceptedOffer = targetOffers.find((offer) => offer.driverId === driver.userId);
  if (!acceptedOffer) throw new Error('Target flow did not create the test driver offer');
  await api(baseUrl, `/api/v1/driver/offers/${acceptedOffer.id}/accept`, driver.token, { method: 'POST', requestId: requestIds.acceptTarget });
  const campaigns = await api(baseUrl, '/api/v1/operator/campaigns', operator.token);
  const reached = campaigns.find((campaign) => campaign.id === targetCampaign.id);
  const finalOffers = await api(baseUrl, `/api/v1/operator/offers?campaignId=${targetCampaign.id}`, operator.token);
  if (reached?.status !== 'TargetReached' || reached.accepted !== 1) throw new Error(`Target transition is incorrect: ${JSON.stringify(reached)}`);
  if (finalOffers.some((offer) => offer.status === 'Open')) throw new Error('Target transition left an offer open');
  const [{ data: targetAudit }, { data: offerAudit }] = await Promise.all([
    adminDb.from('audit_logs').select('id,action,actor_id,before_data,after_data,metadata').eq('entity_id', targetCampaign.id).eq('action', 'CampaignTargetReached'),
    adminDb.from('audit_logs').select('actor_id,before_data,after_data,metadata').eq('entity_id', acceptedOffer.id).eq('action', 'OfferAccepted'),
  ]);
  if (targetAudit?.length !== 1 || targetAudit[0].metadata?.request_id !== requestIds.acceptTarget
    || !targetAudit[0].actor_id || !targetAudit[0].before_data || !targetAudit[0].after_data
    || offerAudit?.length !== 1 || offerAudit[0].metadata?.request_id !== requestIds.acceptTarget
    || !offerAudit[0].actor_id || !offerAudit[0].before_data || !offerAudit[0].after_data) {
    throw new Error('Offer response and target transition audit context is incomplete');
  }
  const auditId = targetAudit[0].id;
  const updateAttempt = await operator.client.from('audit_logs').update({ action: 'Tampered' }).eq('id', auditId).select('id');
  const deleteAttempt = await operator.client.from('audit_logs').delete().eq('id', auditId).select('id');
  const { data: preservedAudit } = await adminDb.from('audit_logs').select('action').eq('id', auditId).single();
  if (updateAttempt.data?.length || deleteAttempt.data?.length || preservedAudit?.action !== 'CampaignTargetReached') {
    throw new Error('Authenticated operator could mutate append-only audit data');
  }

  console.log(JSON.stringify({
    authenticated: true,
    results: [
      { name: 'activate -> monitor -> accept -> cancel', ok: true },
      { name: 'driver accept/decline adapters preserve offer and participation contracts', ok: true },
      { name: 'cancel releases participation and driver', ok: true },
      { name: 'budget exhaustion closes campaign and open offers with SYSTEM audit', ok: true },
      { name: 'end time completes campaign and open offers with SYSTEM audit', ok: true },
      { name: 'activate -> accept -> target reached', ok: true },
      { name: 'target reached expires remaining offers', ok: true },
      { name: 'operator cannot update or delete append-only audit', ok: true },
      { name: 'driver status and offer response audits include request ID, actor, entity, before, and after', ok: true },
    ],
  }, null, 2));
} finally {
  await cleanupFixtures(driver.userId, previousDriverState);
  server.kill();
  await Promise.allSettled([operator.client.auth.signOut(), driver.client.auth.signOut()]);
  if (serverErrors) process.stderr.write(serverErrors);
}
