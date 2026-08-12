import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_OPERATOR_EMAIL', 'TEST_OPERATOR_PASSWORD',
];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const apiBase = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertData(success, error, data, ...rest) {
  const context = rest.at(-1);
  if (error) throw new Error(`${context}: ${error.code ?? ''} ${error.message}`);
  if (success === false) throw new Error(`${context}: database operation failed`);
  return data;
}

async function api(path, token, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-request-id': init.requestId ?? `full-db-${randomUUID()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const signIn = await auth.auth.signInWithPassword({
  email: process.env.TEST_OPERATOR_EMAIL,
  password: process.env.TEST_OPERATOR_PASSWORD,
});
if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error('Operator login failed');
const operatorId = signIn.data.user.id;
const token = signIn.data.session.access_token;

const existingOutputs = await admin.from('model_outputs').select('horizon_min');
if (existingOutputs.error) throw existingOutputs.error;
const existingHorizons = new Set((existingOutputs.data ?? []).map((row) => Number(row.horizon_min)));
for (const horizonMinutes of [15, 30]) {
  if (existingHorizons.has(horizonMinutes)) continue;
  await api('/operator/ai/run-next', token, {
    method: 'POST', body: JSON.stringify({ horizonMinutes, regime: 'rain_peak' }), requestId: `fixture-ai-h${horizonMinutes}`,
  });
}

const proposals = assertData(...Object.values(await admin.from('proposals')
  .select('id,input_snapshot_id,source_plan,target_zone_ids,window_end_at,created_at')
  .eq('generator_type', 'AGENT')
  .eq('status', 'UNDER_REVIEW')
  .order('created_at', { ascending: true })), 'Load generated proposals');
if (proposals.length !== 2) throw new Error(`Expected exactly two AI proposals, found ${proposals.length}`);
const activeProposal = proposals[0];

const driverStates = assertData(...Object.values(await admin.from('driver_states_api_v')
  .select('driver_id,current_location_geojson')
  .eq('is_online', true)
  .eq('operational_status', 'IDLE')
  .not('current_location_geojson', 'is', null)
  .limit(60)), 'Load eligible drivers');
const { data: testProfile } = await admin.from('profiles').select('id').eq('full_name', 'GSM Test Driver').maybeSingle();
const orderedDriverIds = [...new Set([
  testProfile?.id,
  ...driverStates.map((row) => row.driver_id),
].filter(Boolean))];
if (orderedDriverIds.length < 12) throw new Error(`Expected at least 12 eligible drivers, found ${orderedDriverIds.length}`);
const campaignDriverIds = orderedDriverIds.slice(0, 12);

const now = new Date();
const campaignEnd = new Date(now.getTime() + 60 * 60_000).toISOString();
assertData(...Object.values(await admin.from('proposals').update({
  target_driver_count: 12,
  offer_count: 12,
  bonus_amount: 25000,
  fare_multiplier: 1.2,
  estimated_cost: 300000,
  window_start_at: now.toISOString(),
  window_end_at: campaignEnd,
  simulation_details: {
    title: 'AI điều phối giờ cao điểm mưa - bộ kiểm thử đầy đủ',
    scenario_id: 'rain-peak',
    forecast_mode: 'trained_model_replay',
    data_source: `supabase:ai_zone_observations:${activeProposal.input_snapshot_id}`,
    zone_trip_bonus: 12000,
    eligible_driver_count: driverStates.length,
    metrics_before: { unmet_demand: 37, fulfillment_rate: 0.78 },
    metrics_after: { unmet_demand: 8, fulfillment_rate: 0.94 },
    warnings: [],
  },
}).eq('id', activeProposal.id)), 'Configure active proposal');

await api(`/operator/proposals/${activeProposal.id}/approve`, token, {
  method: 'POST', body: JSON.stringify({ note: 'Dữ liệu AI và ngân sách đã được xác minh cho kịch bản kiểm thử.' }),
  requestId: 'fixture-proposal-approved',
});
const campaign = await api(`/operator/proposals/${activeProposal.id}/activate`, token, {
  method: 'POST', body: JSON.stringify({ responseMode: 'mixed', driverIds: campaignDriverIds }),
  requestId: 'fixture-campaign-activated',
});

const offers = assertData(...Object.values(await admin.from('driver_offers')
  .select('id,driver_id,status')
  .eq('campaign_id', campaign.id)
  .order('created_at')), 'Load campaign offers');
const testOffer = offers.find((offer) => offer.driver_id === testProfile?.id);
if (!testOffer) throw new Error('The authenticated demo driver did not receive an open offer');
const workflowOffers = offers.filter((offer) => offer.id !== testOffer.id);
if (workflowOffers.length < 6) throw new Error('Not enough non-demo offers for lifecycle coverage');

for (const offer of workflowOffers.slice(0, 3)) {
  assertData(...Object.values(await admin.rpc('respond_to_offer', {
    p_offer_id: offer.id,
    p_driver_id: offer.driver_id,
    p_response: 'ACCEPTED',
    p_actor_type: 'DRIVER',
    p_request_id: `fixture-accept-${offer.id}`,
  })), `Accept offer ${offer.id}`);
}
for (const offer of workflowOffers.slice(3, 5)) {
  assertData(...Object.values(await admin.rpc('respond_to_offer', {
    p_offer_id: offer.id,
    p_driver_id: offer.driver_id,
    p_response: 'DECLINED',
    p_actor_type: 'DRIVER',
    p_request_id: `fixture-decline-${offer.id}`,
  })), `Decline offer ${offer.id}`);
}
assertData(...Object.values(await admin.rpc('expire_offer', {
  p_offer_id: workflowOffers[5].id,
  p_actor_id: operatorId,
  p_request_id: `fixture-expire-${workflowOffers[5].id}`,
})), 'Expire one offer');

const participations = assertData(...Object.values(await admin.from('campaign_participations')
  .select('id,driver_id,offer_id')
  .eq('campaign_id', campaign.id)
  .order('created_at')), 'Load accepted participations');
const targetZoneId = activeProposal.target_zone_ids?.[0] ?? 1;
const zone = assertData(...Object.values(await admin.from('ai_zone_registry')
  .select('zone_id,center_lat,center_lng')
  .eq('zone_id', targetZoneId)
  .single()), 'Load campaign target zone');
const targetPoint = `POINT(${zone.center_lng} ${zone.center_lat})`;
const statusFixtures = ['ACTIVATED', 'EN_ROUTE', 'ARRIVED_VERIFIED'];
for (let index = 0; index < participations.length; index += 1) {
  const participation = participations[index];
  const status = statusFixtures[index];
  const timestamps = {
    ...(status === 'EN_ROUTE' ? { en_route_at: now.toISOString() } : {}),
    ...(status === 'ARRIVED_VERIFIED' ? {
      en_route_at: new Date(now.getTime() - 10 * 60_000).toISOString(),
      arrived_verified_at: now.toISOString(), first_inside_at: now.toISOString(), dwell_seconds: 180,
    } : {}),
    ...(status === 'ACTIVATED' ? {
      en_route_at: new Date(now.getTime() - 20 * 60_000).toISOString(),
      arrived_verified_at: new Date(now.getTime() - 8 * 60_000).toISOString(),
      activated_at: now.toISOString(), first_inside_at: new Date(now.getTime() - 8 * 60_000).toISOString(), dwell_seconds: 480,
    } : {}),
  };
  assertData(...Object.values(await admin.from('campaign_participations').update({
    status, eligibility_status: status === 'ACTIVATED' ? 'QUALIFIED' : 'PENDING',
    last_location: targetPoint, last_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    ...timestamps,
  }).eq('id', participation.id)), `Advance participation ${participation.id}`);
  assertData(...Object.values(await admin.from('driver_states').update({
    operational_status: status === 'ACTIVATED' ? 'ACTIVATED' : 'EN_ROUTE',
    current_location: targetPoint,
    current_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    location_updated_at: now.toISOString(),
  }).eq('driver_id', participation.driver_id)), `Advance driver ${participation.driver_id}`);
  assertData(...Object.values(await admin.from('driver_location_events').insert({
    driver_id: participation.driver_id,
    participation_id: participation.id,
    location: targetPoint,
    h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    accuracy_m: 7,
    source: 'TEST_FIXTURE',
    recorded_at: now.toISOString(),
    is_inside_geofence: true,
    is_valid: true,
    event_type: status === 'EN_ROUTE' ? 'ROUTE_PROGRESS' : 'GEOFENCE_ENTER',
  })), `Insert GPS event ${participation.id}`);
}

const completed = participations[0];
const onTrip = participations[2];
const completedTripId = randomUUID();
const activeTripId = randomUUID();
assertData(...Object.values(await admin.from('trips').insert([
  {
    id: completedTripId, idempotency_key: `fixture-completed-${completed.id}`,
    driver_id: completed.driver_id, campaign_id: campaign.id, participation_id: completed.id,
    pickup_location: targetPoint, pickup_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    dropoff_location: `POINT(${Number(zone.center_lng) + 0.015} ${Number(zone.center_lat) + 0.01})`,
    dropoff_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    requested_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
    pickup_at: new Date(now.getTime() - 25 * 60_000).toISOString(), dropoff_at: now.toISOString(),
    status: 'COMPLETED', base_fare: 85000, source: 'TEST_FIXTURE',
  },
  {
    id: activeTripId, idempotency_key: `fixture-active-${onTrip.id}`,
    driver_id: onTrip.driver_id, campaign_id: campaign.id, participation_id: onTrip.id,
    pickup_location: targetPoint, pickup_h3_index: `AI-Z${String(zone.zone_id).padStart(2, '0')}`,
    requested_at: new Date(now.getTime() - 3 * 60_000).toISOString(), pickup_at: now.toISOString(),
    status: 'ACCEPTED', base_fare: 62000, source: 'TEST_FIXTURE',
  },
])), 'Insert trip fixtures');
assertData(...Object.values(await admin.from('driver_states').update({
  active_trip_id: activeTripId, operational_status: 'ON_TRIP',
}).eq('driver_id', onTrip.driver_id)), 'Set active trip state');

assertData(...Object.values(await admin.from('reward_records').insert([
  {
    idempotency_key: `fixture-relocation-${completed.id}`, campaign_id: campaign.id,
    driver_id: completed.driver_id, participation_id: completed.id,
    reward_type: 'RELOCATION', amount: 25000, status: 'QUALIFIED',
    reason: 'Đã đến đúng vùng và đủ thời gian lưu trú.', qualified_at: now.toISOString(),
  },
  {
    idempotency_key: `fixture-trip-${completedTripId}`, campaign_id: campaign.id,
    driver_id: completed.driver_id, participation_id: completed.id, trip_id: completedTripId,
    reward_type: 'ZONE_TRIP', amount: 12000, status: 'SIMULATED_PAID',
    reason: 'Chuyến hoàn thành trong vùng chiến dịch.', qualified_at: now.toISOString(), paid_at: now.toISOString(),
  },
])), 'Insert reward ledger');
assertData(...Object.values(await admin.from('campaigns').update({ budget_used: 37000 }).eq('id', campaign.id)), 'Update campaign budget');

assertData(...Object.values(await admin.from('audit_logs').insert([
  {
    actor_id: completed.driver_id, actor_type: 'DRIVER', entity_type: 'trip', entity_id: completedTripId,
    action: 'TripCompleted', after_data: { status: 'COMPLETED' }, metadata: { request_id: 'fixture-trip-completed', campaign_id: campaign.id },
  },
  {
    actor_id: null, actor_type: 'SYSTEM', entity_type: 'reward', entity_id: `fixture-trip-${completedTripId}`,
    action: 'RewardQualified', after_data: { amount: 12000, status: 'SIMULATED_PAID' }, metadata: { request_id: 'fixture-reward-qualified', campaign_id: campaign.id },
  },
])), 'Insert trip/reward audit');

const tableNames = [
  'supply_demand_snapshots', 'ai_zone_observations', 'ai_zone_forecasts', 'model_inputs', 'model_outputs',
  'proposals', 'campaigns', 'driver_offers', 'campaign_participations', 'driver_location_events',
  'trips', 'reward_records', 'audit_logs',
];
const counts = Object.fromEntries(await Promise.all(tableNames.map(async (table) => {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return [table, count];
})));

console.log(JSON.stringify({
  ready: true,
  operatorId,
  testDriverId: testProfile?.id ?? null,
  openTestDriverOfferId: testOffer.id,
  activeProposalId: activeProposal.id,
  reviewProposalId: proposals[1].id,
  campaignId: campaign.id,
  counts,
}, null, 2));

await auth.auth.signOut();
