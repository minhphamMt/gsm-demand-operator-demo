import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'TEST_OPERATOR_EMAIL', 'TEST_OPERATOR_PASSWORD'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await auth.auth.signInWithPassword({
  email: process.env.TEST_OPERATOR_EMAIL,
  password: process.env.TEST_OPERATOR_PASSWORD,
});
if (error || !data.session) throw error ?? new Error('Operator authentication failed');
const token = data.session.access_token;

let requestIndex = 0;
async function api(path, init = {}) {
  requestIndex += 1;
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-request-id': `model-flow-${Date.now()}-${requestIndex}`,
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const ingested = await api('/operator/ai/run-next', {
  method: 'POST',
  body: JSON.stringify({ horizonMinutes: 15, regime: 'rain_peak' }),
});
const snapshotId = ingested?.snapshot?.id;
if (!Number.isInteger(snapshotId)) throw new Error('Forecast did not return a persisted snapshot');
const replayWindow = await api('/operator/ai/replay-window', {
  method: 'POST',
  body: JSON.stringify({ sourceAt: ingested.snapshot.sourceAt }),
});
const replaySourceAt = replayWindow.steps?.find((step) => step.source_at !== ingested.snapshot.sourceAt)?.source_at;
if (!replaySourceAt) throw new Error('Replay window did not return another real 5-minute bucket');
const replay = await api('/operator/ai/replay', {
  method: 'POST',
  body: JSON.stringify({ sourceAt: replaySourceAt }),
});
if (!Number.isInteger(replay?.snapshot?.id) || replay?.decision !== undefined) {
  throw new Error('A historical replay bucket must return observed data without invoking the model');
}
// `run-next` creates a new snapshot and explicit future forecast every time,
// making it the correct target for an idempotent smoke run. Replay only persists
// historical observations,
// so create one final current snapshot afterwards; otherwise the safety guard
// correctly marks the original snapshot stale before approval.
const optimizationRun = await api('/operator/ai/run-next', {
  method: 'POST',
  body: JSON.stringify({ horizonMinutes: 15, regime: 'rain_peak' }),
});
const optimizationSnapshotId = optimizationRun?.snapshot?.id;
if (!Number.isInteger(optimizationSnapshotId)) throw new Error('Final forecast-only run did not persist an optimization snapshot');

const before = await api('/operator/proposals');
if (before.some((proposal) => proposal.generatorType === 'AGENT' && proposal.inputSnapshotId === String(optimizationSnapshotId))) {
  throw new Error('Forecast-only stage created a proposal before optimization');
}

await api('/operator/ai/optimize', {
  method: 'POST',
  body: JSON.stringify({ snapshotId: optimizationSnapshotId, horizonMinutes: 15 }),
});
const after = await api('/operator/proposals');
const proposal = after.find((candidate) => candidate.generatorType === 'AGENT' && candidate.inputSnapshotId === String(optimizationSnapshotId));
if (!proposal) throw new Error('Optimizer did not create a proposal for the selected snapshot');
const hasOperationalAction = proposal.moves.length > 0 || proposal.targetDriverCount > 0;
const policyPassed = proposal.policyChecks?.[0]?.passed;
if (!hasOperationalAction && (proposal.status !== 'FailedGeneration' || policyPassed !== false)) {
  throw new Error(`A no-action model decision was not retained safely: ${JSON.stringify({ status: proposal.status, policyPassed })}`);
}
if (hasOperationalAction && proposal.status !== 'UnderReview') {
  throw new Error(`An actionable model decision was not placed in review: ${proposal.status}`);
}
if (proposal.activationBudgetLimit > 0 && proposal.expectedOfferCount * proposal.relocationBonus > proposal.activationBudgetLimit) {
  throw new Error('Activation recommendation exceeds its model budget guard');
}

let deliveredOffers = 0;
if (hasOperationalAction) {
  const approved = await api(`/operator/proposals/${proposal.id}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: proposal.version,
      note: 'Automated end-to-end verification of the operator model flow',
    }),
  });
  if (approved.status !== 'Approved') throw new Error(`Proposal was not approved: ${approved.status}`);

  const campaign = await api(`/operator/proposals/${proposal.id}/activate`, {
    method: 'POST',
    body: JSON.stringify({ responseMode: 'human' }),
  });
  const offers = await api(`/operator/offers?campaignId=${campaign.id}`);
  if (!offers.length) throw new Error('Campaign was created but no driver offer was delivered');
  deliveredOffers = offers.length;
  await api(`/operator/campaigns/${campaign.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Model flow verification complete', disposition: 'RELEASE_OPEN_ONLY', policyVersion: 'smoke-v1' }),
  });
}

console.log(JSON.stringify({
  snapshotId: optimizationSnapshotId,
  proposalId: proposal.id,
  directMoves: proposal.moves.length,
  targetDriverCount: proposal.targetDriverCount,
  offerPool: proposal.expectedOfferCount,
  deliveredOffers,
  forecastSeparatedFromOptimization: true,
  replayFiveMinuteModelVerified: true,
  noActionOutcomeVerified: !hasOperationalAction,
  driverOfferPathVerified: hasOperationalAction,
}, null, 2));
