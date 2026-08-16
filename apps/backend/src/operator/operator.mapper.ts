type Row = Record<string, any>;

const iso = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);
const number = (value: unknown) => Number(value ?? 0);
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);

const aiZoneNames: Record<number, string> = {
  1: 'Ba Đình', 2: 'Hoàn Kiếm', 3: 'Hai Bà Trưng', 4: 'Đống Đa', 5: 'Tây Hồ',
  6: 'Cầu Giấy', 7: 'Thanh Xuân', 8: 'Hoàng Mai', 9: 'Long Biên', 10: 'Bắc Từ Liêm',
  11: 'Nam Từ Liêm', 12: 'Hà Đông', 13: 'Thanh Trì', 14: 'Gia Lâm', 15: 'Đông Anh',
  16: 'Sóc Sơn', 17: 'Ba Vì', 18: 'Phúc Thọ', 19: 'Thạch Thất', 20: 'Quốc Oai',
  21: 'Chương Mỹ', 22: 'Đan Phượng', 23: 'Hoài Đức', 24: 'Thanh Oai', 25: 'Mỹ Đức',
  26: 'Ứng Hòa', 27: 'Thường Tín', 28: 'Phú Xuyên', 29: 'Mê Linh', 30: 'Sơn Tây',
};

const normalizeZoneId = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30
    ? `AI-Z${String(parsed).padStart(2, '0')}`
    : String(value ?? '');
};

const zoneLabel = (value: unknown, fallback?: unknown) => {
  const parsed = Number(value);
  return String(fallback ?? aiZoneNames[parsed] ?? value ?? '');
};

const proposalStatus: Record<string, string> = {
  GENERATED: 'Generated',
  UNDER_REVIEW: 'UnderReview',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  STALE: 'Stale',
  FAILED_GENERATION: 'FailedGeneration',
};

const campaignStatus: Record<string, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  TARGET_REACHED: 'TargetReached',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  BUDGET_EXHAUSTED: 'BudgetExhausted',
  EXPIRED: 'Expired',
  SETTLING: 'Settling',
  SETTLED: 'Settled',
};

const offerStatus: Record<string, string> = {
  CREATED: 'Open',
  SENT: 'Open',
  DELIVERED: 'Open',
  VIEWED: 'Open',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CANCELLED_BEFORE_ACCEPT: 'Cancelled',
};

const metrics = (value: Row = {}) => ({
  fulfillmentRate: number(value.fulfillment_rate ?? value.fulfillmentRate),
  residualGap: number(value.unmet_demand ?? value.gap ?? value.residual_gap ?? value.residualGap),
  deadheadKm: number(value.deadhead_km ?? value.deadheadKm),
  budget: number(value.budget),
  expectedTrips: number(value.expected_trips ?? value.expectedTrips),
  avgWaitProxy: number(value.eta_p50_min ?? value.avg_wait_proxy ?? value.avgWaitProxy),
});

export const mapProposal = (row: Row) => {
  const simulation = row.simulation_details ?? {};
  const sourcePlan = row.source_plan ?? {};
  const rawMoves = Array.isArray(sourcePlan.moves) ? sourcePlan.moves : [];
  const before = simulation.metrics_before ?? simulation.metricsBefore ?? {};
  const after = simulation.metrics_after ?? simulation.metricsAfter ?? simulation.metrics ?? {};
  const residual = Array.isArray(sourcePlan.residual_gap) ? sourcePlan.residual_gap : [];
  const beforeMetrics = metrics(before);
  const afterMetrics = metrics(after);
  const revisedResidualGap = row.parent_proposal_id
    ? residual.reduce((sum: number, item: Row) => sum + number(item.gap_remaining ?? item.gapRemaining), 0)
    : null;
  const impliedDemand = beforeMetrics.fulfillmentRate < 100
    ? beforeMetrics.residualGap / Math.max(0.0001, 1 - beforeMetrics.fulfillmentRate / 100)
    : 0;
  const effectiveAfterMetrics = revisedResidualGap === null ? afterMetrics : {
    ...afterMetrics,
    fulfillmentRate: impliedDemand > 0 ? Math.max(0, (1 - revisedResidualGap / impliedDemand) * 100) : 100,
    residualGap: revisedResidualGap,
  };
  const derivedTargets = residual.map((item: Row) => normalizeZoneId(item.zone_id));
  const targetZoneIds = row.target_zone_ids?.length
    ? row.target_zone_ids.map(normalizeZoneId)
    : derivedTargets;
  const rawWarnings = Array.isArray(simulation.warnings)
    ? simulation.warnings
    : Array.isArray(sourcePlan.warnings) ? sourcePlan.warnings : [];

  return {
    id: row.id,
    rootProposalId: row.root_proposal_id ?? row.id,
    parentProposalId: row.parent_proposal_id ?? null,
    title: simulation.title ?? `Phương án #${row.version ?? 1}`,
    status: proposalStatus[row.status] ?? row.status,
    createdAt: iso(row.created_at),
    version: row.version ?? 1,
    contentHash: row.content_hash ?? null,
    approvedContentHash: row.approved_content_hash ?? null,
    approvedVersion: row.approved_version ?? null,
    optimizerRunId: row.optimizer_run_id ?? null,
    rank: simulation.rank ?? 1,
    scenarioId: simulation.scenario_id ?? 'normal',
    generatorType: row.generator_type,
    generatorVersion: row.generator_version ?? 'unknown',
    planMode: simulation.plan_mode ?? (rawMoves.length ? 'RELOCATION' : 'ACTIVATION_ONLY'),
    forecastMode: simulation.forecast_mode ?? null,
    dataSource: simulation.data_source ?? null,
    forecastRunId: simulation.forecast_run_id ?? sourcePlan.forecast_run_id ?? null,
    modelInputId: simulation.model_input_id ?? sourcePlan.model_input_id ?? null,
    inputSnapshotId: row.input_snapshot_id ? String(row.input_snapshot_id) : null,
    hotspotId: row.hotspot_id,
    targetZoneId: targetZoneIds[0] ?? null,
    targetZoneIds,
    targetZoneLabel: simulation.target_zone_label
      ?? residual.map((item: Row) => zoneLabel(item.zone_id)).join(', ')
      ?? targetZoneIds.join(', ')
      ?? 'N/A',
    confidence: nullableNumber(simulation.confidence),
    simulationAvailable: Object.keys(before).length > 0 && Object.keys(after).length > 0,
    candidateSourceZones: Array.isArray(sourcePlan.candidate_source_zones)
      ? sourcePlan.candidate_source_zones.map((source: Row) => ({
          ...source,
          zoneId: normalizeZoneId(source.zoneId ?? source.zone_id),
          label: zoneLabel(source.zoneId ?? source.zone_id, source.label ?? source.zone_name),
          availableSupply: number(source.availableSupply ?? source.available_supply),
          distanceKm: number(source.distanceKm ?? source.distance_km),
          etaMinutes: number(source.etaMinutes ?? source.eta_minutes),
        }))
      : [],
    moves: rawMoves.map((move: Row, index: number) => ({
      id: move.id ?? `${row.id}-move-${index + 1}`,
      sourceZoneId: normalizeZoneId(move.from_zone ?? move.sourceZoneId),
      sourceZoneLabel: zoneLabel(move.from_zone, move.source_zone_label),
      targetZoneId: normalizeZoneId(move.to_zone ?? move.targetZoneId ?? targetZoneIds[0]),
      targetZoneLabel: move.to_zone !== undefined
        ? zoneLabel(move.to_zone, move.target_zone_label)
        : String(move.target_zone_label ?? targetZoneIds[0] ?? ''),
      quantity: number(move.drivers ?? move.units_to_move ?? move.quantity),
      distanceKm: number(move.estimated_distance_km ?? move.distance_km ?? move.distanceKm),
      etaMinutes: number(move.eta_minutes ?? move.etaMinutes ?? number(move.eta_steps) * 5),
      estimatedCost: number(move.estimated_cost ?? move.estimatedCost),
      // `after_gap` is the target shortage after this move, not source supply.
      sourceSupplyAfter: number(move.source_supply_after ?? move.sourceSupplyAfter),
    })),
    targetDriverCount: row.target_driver_count ?? 0,
    expectedOfferCount: row.offer_count ?? 0,
    eligibleDriverCount: number(simulation.eligible_driver_count),
    averageDistanceKm: number(simulation.average_distance_km),
    averageEtaMinutes: number(simulation.average_eta_minutes ?? after.eta_p50_min),
    campaignDurationMinutes: row.window_start_at && row.window_end_at
      ? Math.max(0, Math.round((new Date(row.window_end_at).getTime() - new Date(row.window_start_at).getTime()) / 60000))
      : 0,
    relocationBonus: number(row.bonus_amount),
    zoneTripBonus: number(simulation.zone_trip_bonus),
    fareMultiplier: number(row.fare_multiplier),
    budgetLimit: number(sourcePlan.plan_totals?.budget_cap ?? row.estimated_cost),
    activationBudgetLimit: number(simulation.activation_policy?.incentive_budget_cap),
    activationTtlMinutes: number(simulation.activation_policy?.offer_ttl_minutes),
    estimatedRewardCost: number(sourcePlan.plan_totals?.total_cost ?? row.estimated_cost),
    estimatedAdditionalRevenue: number(simulation.estimated_additional_revenue),
    estimatedNetCost: number(simulation.estimated_net_cost ?? row.estimated_cost),
    policyChecks: [{
      id: 'proposal-policy',
      label: 'Kiểm tra chính sách',
      passed: row.policy_status === 'PASSED',
      blocking: true,
      detail: row.policy_status ?? 'PENDING',
    }],
    warnings: rawWarnings.map((warning: Row, index: number) => ({
      id: String(warning.id ?? warning.code ?? `warning-${index + 1}`),
      severity: warning.severity ?? 'warning',
      title: String(warning.title ?? warning.code ?? 'Cảnh báo từ model'),
      detail: String(warning.detail ?? warning.message ?? ''),
    })),
    metricsBefore: beforeMetrics,
    metrics: effectiveAfterMetrics,
    metricsAfterRelocation: row.parent_proposal_id
      ? effectiveAfterMetrics
      : simulation.metrics_after_relocation ? metrics(simulation.metrics_after_relocation) : undefined,
    metricsAfterActivation: simulation.metrics_after_activation_expected ? metrics(simulation.metrics_after_activation_expected) : undefined,
    explanation: Array.isArray(row.explanation) ? row.explanation : [row.explanation].filter(Boolean),
    inputFreshUntil: iso(row.window_end_at),
  };
};

export const mapOffer = (row: Row) => ({
  id: row.id,
  campaignId: row.campaign_id,
  driverId: row.driver_id,
  targetZoneId: row.campaigns?.target_zone_ids?.length ? normalizeZoneId(row.campaigns.target_zone_ids[0]) : null,
  targetZoneIds: row.campaigns?.target_zone_ids?.map(normalizeZoneId) ?? [],
  reasonText: row.campaigns?.display_area_name
    ? `Điều phối tới ${row.campaigns.display_area_name}`
    : 'Điều phối tới vùng thiếu cung',
  incentiveAmount: number(row.campaigns?.bonus_amount),
  distanceKm: number(row.distance_m) / 1000,
  etaMinutes: Math.ceil(number(row.eta_seconds) / 60),
  expiresAt: iso(row.expires_at),
  status: offerStatus[row.status] ?? row.status,
  databaseStatus: row.status,
  respondedAt: iso(row.responded_at),
});

export const mapDriver = (row: Row) => ({
  id: row.driver_id,
  name: row.driver_name ?? row.profiles?.full_name ?? 'Tài xế',
  status: row.is_online
    ? ({ IDLE: 'online_idle', EN_ROUTE: 'en_route', ACTIVATED: 'activated', ON_TRIP: 'on_trip' } as Record<string, string>)[row.operational_status] ?? 'online_idle'
    : 'offline',
  homeZoneId: row.current_h3_index,
  currentLocation: row.current_location_geojson?.coordinates ?? null,
  activeCampaignId: row.active_campaign_id ?? null,
  activeTripId: row.active_trip_id ?? null,
  distanceKm: 0,
  shiftEndsInMinutes: 0,
  acceptedOfferIds: [],
  rewardTotal: 0,
});

export const mapCampaign = (row: Row, offers: Row[], participations: Row[], trips: Row[] = []) => {
  const campaignOffers = offers.filter((item) => item.campaign_id === row.id);
  const campaignParticipations = participations.filter((item) => item.campaign_id === row.id);
  const countOffer = (status: string) => campaignOffers.filter((item) => item.status === status).length;
  const countPart = (status: string) => campaignParticipations.filter((item) => item.status === status).length;
  return {
    id: row.id,
    planId: row.proposal_id,
    status: campaignStatus[row.status] ?? row.status,
    databaseStatus: row.status,
    targetZoneId: row.target_zone_ids?.length ? normalizeZoneId(row.target_zone_ids[0]) : null,
    targetZoneIds: row.target_zone_ids?.map(normalizeZoneId) ?? [],
    candidateCount: campaignOffers.length,
    offersSent: campaignOffers.filter((item) => item.sent_at).length,
    viewed: campaignOffers.filter((item) => item.viewed_at).length,
    accepted: countOffer('ACCEPTED'),
    declined: countOffer('DECLINED'),
    expired: countOffer('EXPIRED'),
    cancelled: countPart('CANCELLED_AFTER_ACCEPT') + countPart('CANCELLED') + countOffer('CANCELLED_BEFORE_ACCEPT'),
    enRoute: countPart('EN_ROUTE'),
    arrivedVerified: countPart('ARRIVED_VERIFIED'),
    unitsGained: countPart('ACTIVATED'),
    qualifiedTrips: trips.filter((item) => item.campaign_id === row.id && item.status === 'COMPLETED').length,
    incentiveBudget: number(row.budget_used),
    budgetLimit: number(row.budget_limit),
    worstCaseCommitment: number(row.bonus_amount) * (row.target_driver_count ?? 0),
    startedAt: iso(row.start_at ?? row.created_at),
    expiresAt: iso(row.end_at),
    // Production activation has no response simulator. Historical `mixed`
    // requests still created real offers and therefore also map to `human`.
    responseMode: 'human',
    // Campaign progress is measured against accepted/activated drivers, not the
    // overbooked offer batch. A target of 2 may legitimately send 5 offers.
    suggestedActivation: number(row.target_driver_count),
  };
};
