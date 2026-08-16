import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const SOURCE = 'DEMO_ANALYTICS_SEED';
const POLICY_VERSION = 'demo-analytics-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const definitions = [
  { label: 'Cao điểm sáng', activated: 6, trips: 4, budgetLimit: 300_000, status: 'COMPLETED', zones: [2, 3] },
  { label: 'Giữa trưa', activated: 9, trips: 7, budgetLimit: 420_000, status: 'SETTLED', zones: [7, 8] },
  { label: 'Mưa giờ cao điểm', activated: 12, trips: 10, budgetLimit: 560_000, status: 'COMPLETED', zones: [1, 4, 5] },
  { label: 'Cao điểm tối', activated: 8, trips: 6, budgetLimit: 380_000, status: 'EXPIRED', zones: [11, 12] },
];

const uuid = (kind, index) => `4210000${kind}-0000-4000-8000-${String(index).padStart(12, '0')}`;
const iso = (value) => new Date(value).toISOString();
const assert = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoCampaignIds = definitions.map((_, index) => uuid(1, index + 1));
const [proposalRows, campaignRows, driverRows, accountRows, operatorRows] = await Promise.all([
  db.from('proposals').select('id').eq('status', 'APPROVED').order('created_at', { ascending: false }),
  db.from('campaigns').select('id,proposal_id'),
  db.from('profiles').select('id').eq('role', 'DRIVER').eq('is_active', true).order('id').limit(20),
  db.from('budget_accounts').select('id').eq('account_key', 'HN:operator').limit(1),
  db.from('profiles').select('id').eq('role', 'OPERATOR').eq('is_active', true).limit(1),
]);

const proposals = assert(proposalRows, 'Load approved proposals') ?? [];
const existingCampaigns = assert(campaignRows, 'Load campaigns') ?? [];
const drivers = assert(driverRows, 'Load drivers') ?? [];
const account = assert(accountRows, 'Load budget account')?.[0];
const operator = assert(operatorRows, 'Load operator')?.[0];
if (!account) throw new Error('The HN:operator budget account is required.');
const usedProposalIds = new Set(existingCampaigns.map((campaign) => campaign.proposal_id));
const unusedProposals = proposals.filter((proposal) => !usedProposalIds.has(proposal.id));
const existingDemoCampaigns = new Map(existingCampaigns.filter((campaign) => demoCampaignIds.includes(campaign.id)).map((campaign) => [campaign.id, campaign]));
const proposalIds = demoCampaignIds.map((campaignId, index) => existingDemoCampaigns.get(campaignId)?.proposal_id ?? unusedProposals[index]?.id);
if (proposalIds.some((proposalId) => !proposalId)) {
  throw new Error(`Expected ${definitions.length} unused approved proposals for first seed; found ${unusedProposals.length}.`);
}
if (drivers.length < Math.max(...definitions.map((item) => item.activated))) {
  throw new Error(`Expected at least 12 active drivers, found ${drivers.length}.`);
}

const campaigns = [];
const offers = [];
const participations = [];
const trips = [];
const rewards = [];
const ledger = [];
const audits = [];
const now = Date.now();

definitions.forEach((definition, campaignIndex) => {
  const sequence = campaignIndex + 1;
  const campaignId = uuid(1, sequence);
  const start = now - (definitions.length - campaignIndex) * DAY_MS;
  const end = start + 90 * 60_000;
  const paidAmount = definition.trips * 15_000;
  const qualifiedAmount = definition.activated * 20_000 + paidAmount;
  campaigns.push({
    id: campaignId,
    proposal_id: proposalIds[campaignIndex],
    status: definition.status,
    target_zone_ids: definition.zones,
    target_h3_indexes: definition.zones.map((zone) => `AI-Z${String(zone).padStart(2, '0')}`),
    display_area_name: `${definition.label} · dữ liệu demo`,
    target_driver_count: definition.activated,
    batch_size: definition.activated,
    start_at: iso(start),
    end_at: iso(end),
    reward_cutoff_at: iso(end + 30 * 60_000),
    bonus_amount: 20_000,
    fare_multiplier: 1.15,
    budget_limit: definition.budgetLimit,
    budget_used: qualifiedAmount,
    budget_account_id: account.id,
    created_by: operator?.id ?? null,
    completed_at: iso(end),
    created_at: iso(start - 10 * 60_000),
    updated_at: iso(end),
  });

  drivers.slice(0, definition.activated).forEach((driver, driverIndex) => {
    const rowIndex = sequence * 100 + driverIndex + 1;
    const offerId = uuid(2, rowIndex);
    const participationId = uuid(3, rowIndex);
    offers.push({
      id: offerId, campaign_id: campaignId, driver_id: driver.id, batch_no: 1, status: 'ACCEPTED',
      distance_m: 900 + driverIndex * 170, eta_seconds: 300 + driverIndex * 30,
      sent_at: iso(start - 20 * 60_000), viewed_at: iso(start - 18 * 60_000),
      responded_at: iso(start - 15 * 60_000), expires_at: iso(start + 10 * 60_000), created_at: iso(start - 20 * 60_000),
    });
    participations.push({
      id: participationId, campaign_id: campaignId, driver_id: driver.id, offer_id: offerId,
      status: 'ACTIVATED', eligibility_status: 'QUALIFIED', accepted_at: iso(start - 15 * 60_000),
      en_route_at: iso(start - 10 * 60_000), arrived_verified_at: iso(start), activated_at: iso(start + 3 * 60_000),
      first_inside_at: iso(start), dwell_seconds: 600, created_at: iso(start - 15 * 60_000), updated_at: iso(end),
    });
    rewards.push({
      idempotency_key: `${SOURCE}:relocation:${campaignId}:${driver.id}`,
      campaign_id: campaignId, driver_id: driver.id, participation_id: participationId,
      reward_type: 'RELOCATION', amount: 20_000, status: 'QUALIFIED',
      reason: 'Dữ liệu demo phân tích: tài xế đã đến vùng và đủ thời gian lưu trú.', qualified_at: iso(start + 10 * 60_000), created_at: iso(start + 10 * 60_000),
    });
    if (driverIndex < definition.trips) {
      const tripId = uuid(4, rowIndex);
      trips.push({
        id: tripId, idempotency_key: `${SOURCE}:trip:${campaignId}:${driver.id}`,
        driver_id: driver.id, campaign_id: campaignId, participation_id: participationId,
        pickup_h3_index: `AI-Z${String(definition.zones[0]).padStart(2, '0')}`,
        dropoff_h3_index: `AI-Z${String(definition.zones.at(-1)).padStart(2, '0')}`,
        requested_at: iso(start + 15 * 60_000), pickup_at: iso(start + 20 * 60_000), dropoff_at: iso(start + 45 * 60_000),
        status: 'COMPLETED', base_fare: 65_000 + driverIndex * 4_000, source: SOURCE, created_at: iso(start + 15 * 60_000),
      });
      rewards.push({
        idempotency_key: `${SOURCE}:trip-reward:${tripId}`,
        campaign_id: campaignId, driver_id: driver.id, participation_id: participationId, trip_id: tripId,
        reward_type: 'ZONE_TRIP', amount: 15_000, status: 'SIMULATED_PAID',
        reason: 'Dữ liệu demo phân tích: chuyến hoàn thành trong vùng campaign.',
        qualified_at: iso(start + 45 * 60_000), paid_at: iso(start + 50 * 60_000), created_at: iso(start + 45 * 60_000),
      });
    }
  });

  const lifecycle = [
    ['RESERVED', definition.budgetLimit],
    ['COMMITTED', qualifiedAmount],
    ['QUALIFIED', qualifiedAmount],
    ['PAID', paidAmount],
    ['RELEASED', definition.budgetLimit - qualifiedAmount],
  ];
  lifecycle.forEach(([entryType, amount], index) => ledger.push({
    id: uuid(5, sequence * 100 + index + 1), account_id: account.id, campaign_id: campaignId,
    entry_type: entryType, amount, source: SOURCE, policy_version: POLICY_VERSION,
    idempotency_key: `${SOURCE}:${campaignId}:${entryType}`, metadata: { demo: true, seedVersion: POLICY_VERSION },
    created_at: iso(end + index * 60_000),
  }));
  audits.push({
    actor_id: operator?.id ?? null, actor_type: 'SYSTEM', entity_type: 'campaign', entity_id: campaignId,
    action: 'DemoAnalyticsSeeded', after_data: { source: SOURCE, policyVersion: POLICY_VERSION },
    metadata: { demo: true, source: SOURCE }, created_at: iso(end),
  });
});

const preview = {
  apply: APPLY,
  source: SOURCE,
  campaigns: campaigns.length,
  activatedDrivers: participations.length,
  completedTrips: trips.length,
  rewards: rewards.length,
  ledgerEntries: ledger.length,
};
if (!APPLY) {
  console.log(JSON.stringify(preview, null, 2));
  console.log('Preview only. Re-run with --apply to write deterministic demo rows.');
  process.exit(0);
}

assert(await db.from('campaigns').upsert(campaigns, { onConflict: 'id' }), 'Upsert campaigns');
assert(await db.from('driver_offers').upsert(offers, { onConflict: 'id' }), 'Upsert offers');
assert(await db.from('campaign_participations').upsert(participations, { onConflict: 'id' }), 'Upsert participations');
assert(await db.from('trips').upsert(trips, { onConflict: 'id' }), 'Upsert trips');
assert(await db.from('reward_records').upsert(rewards, { onConflict: 'idempotency_key' }), 'Upsert rewards');
assert(await db.from('budget_ledger_entries').upsert(ledger, { onConflict: 'id' }), 'Upsert budget ledger');

const existingAudits = assert(await db.from('audit_logs').select('entity_id').in('entity_id', campaigns.map((campaign) => campaign.id)).eq('action', 'DemoAnalyticsSeeded'), 'Load seed audits') ?? [];
const existingAuditIds = new Set(existingAudits.map((row) => row.entity_id));
const missingAudits = audits.filter((audit) => !existingAuditIds.has(audit.entity_id));
if (missingAudits.length) assert(await db.from('audit_logs').insert(missingAudits), 'Insert seed audits');

console.log(JSON.stringify({ ...preview, applied: true }, null, 2));
