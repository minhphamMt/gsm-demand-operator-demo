import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';
import { buildRevisedSourcePlan } from './revision-source-plan';
import { calculateSnapshotKpis, mapAiZone } from './snapshot.mapper';
import {
  ActivateProposalDto,
  ApproveProposalDto,
  AuditQueryDto,
  DriverStatusDto,
  OfferResponseDto,
  OperationsReportQueryDto,
  SnapshotQueryDto,
  SnapshotWindowQueryDto,
  RejectProposalDto,
  ReviseProposalDto,
} from './dto/operator.dto';
import { mapCampaign, mapDriver, mapOffer, mapProposal } from './operator.mapper';
import { buildOperationsReport } from './operations-report.mapper';
import { revisionFieldErrors } from './revision-validation';
import { proposalActivationIssue, proposalReviewIssue, type ReviewDecision } from './review-validation';

const auditActionAliases: Record<string, string[]> = {
  Created: ['Created', 'CREATE'],
  Revised: ['Revised', 'REVISE'],
  Approved: ['Approved', 'APPROVE'],
  Rejected: ['Rejected', 'REJECT'],
  ActivationStarted: ['ActivationStarted', 'ACTIVATE'],
  CampaignCancelled: ['CampaignCancelled', 'CANCEL_CAMPAIGN'],
  CampaignTargetReached: ['CampaignTargetReached'],
  OfferAccepted: ['OfferAccepted', 'ACCEPT_OFFER'],
  OfferDeclined: ['OfferDeclined', 'DECLINE_OFFER'],
  OfferExpired: ['OfferExpired', 'EXPIRE_OFFER'],
};
const canonicalAuditAction = (action: string) => Object.entries(auditActionAliases).find(([, aliases]) => aliases.includes(action))?.[0] ?? action;
const auditEntityAliases: Record<string, string[]> = {
  proposal: ['proposal', 'proposals'],
  campaign: ['campaign', 'campaigns'],
  offer: ['offer', 'driver_offers'],
  driver: ['driver', 'drivers'],
  trip: ['trip', 'trips'],
  reward: ['reward', 'reward_records'],
};
const canonicalAuditEntity = (entityType: string) => Object.entries(auditEntityAliases).find(([, aliases]) => aliases.includes(entityType))?.[0] ?? entityType;

@Injectable()
export class OperatorService {
  constructor(private readonly db: SupabaseService) {}

  async latestSnapshot(query: SnapshotQueryDto = {}) {
    this.validateSnapshotWindow(query);
    let snapshotQuery = this.db.client
      .from('supply_demand_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (query.scenarioCode) snapshotQuery = snapshotQuery.eq('scenario_code', query.scenarioCode);
    if (query.from) snapshotQuery = snapshotQuery.gte('captured_at', query.from);
    if (query.to) snapshotQuery = snapshotQuery.lte('captured_at', query.to);
    const { data: snapshot, error } = await snapshotQuery.limit(1).maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!snapshot) throw new NotFoundException('No supply-demand snapshot exists');
    return this.mapSnapshot(snapshot, query);
  }

  async snapshotWindow(query: SnapshotWindowQueryDto) {
    this.validateSnapshotWindow(query);
    let snapshotQuery = this.db.client.from('supply_demand_snapshots').select('*').order('captured_at', { ascending: false }).order('id', { ascending: false });
    if (query.scenarioCode) snapshotQuery = snapshotQuery.eq('scenario_code', query.scenarioCode);
    if (query.from) snapshotQuery = snapshotQuery.gte('captured_at', query.from);
    if (query.to) snapshotQuery = snapshotQuery.lte('captured_at', query.to);
    const { data, error } = await snapshotQuery.limit(query.limit);
    const snapshots = this.db.unwrap(data, error);
    return Promise.all(snapshots.map((snapshot: any) => this.mapSnapshot(snapshot, query)));
  }

  async snapshotById(id: number, query: SnapshotQueryDto = {}) {
    const { data: snapshot, error } = await this.db.client.from('supply_demand_snapshots').select('*').eq('id', id).maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!snapshot) throw new NotFoundException(`Snapshot ${id} was not found`);
    return this.mapSnapshot(snapshot, query);
  }

  private async mapSnapshot(snapshot: any, query: SnapshotQueryDto) {
    let observationsQuery = this.db.client.from('ai_zone_observations').select('*').eq('snapshot_id', snapshot.id);
    const aiZoneQuery = this.db.client.from('ai_zone_registry_api_v').select('*').eq('is_active', true).order('zone_id');
    let forecastQuery = this.db.client.from('ai_zone_forecasts').select('*').eq('snapshot_id', snapshot.id);
    if (query.zoneId) {
      observationsQuery = observationsQuery.eq('zone_id', query.zoneId);
      forecastQuery = forecastQuery.eq('zone_id', query.zoneId);
    }
    const [
      { data: observations, error: observationsError },
      { data: forecasts, error: forecastError },
      { data: aiZones, error: aiZonesError },
    ] = await Promise.all([
      observationsQuery,
      forecastQuery,
      aiZoneQuery,
    ]);
    this.db.unwrap(observations, observationsError);
    this.db.unwrap(forecasts, forecastError);
    this.db.unwrap(aiZones, aiZonesError);

    const observationsByZone = new Map((observations ?? []).map((observation: any) => [Number(observation.zone_id), observation]));
    const forecastsByZone = new Map<number, { horizon5?: any; horizon15?: any; horizon30?: any }>();
    for (const forecast of forecasts ?? []) {
      const current = forecastsByZone.get(Number(forecast.zone_id)) ?? {};
      if (Number(forecast.horizon_min) === 5) current.horizon5 = forecast;
      if (Number(forecast.horizon_min) === 15) current.horizon15 = forecast;
      if (Number(forecast.horizon_min) === 30) current.horizon30 = forecast;
      forecastsByZone.set(Number(forecast.zone_id), current);
    }
    const liveZoneIds = new Set((observations ?? []).filter((observation: any) => observation.data_status === 'live').map((observation: any) => Number(observation.zone_id)));
    const forecastedZoneIds = new Set((forecasts ?? []).map((forecast: any) => Number(forecast.zone_id)));
    const latestForecast = [...(forecasts ?? [])].sort((left: any, right: any) =>
      new Date(right.forecast_at).getTime() - new Date(left.forecast_at).getTime())[0];
    const replaySource = String((observations ?? [])[0]?.source_name ?? '');
    const replayPrefix = ['AI_PARQUET_REPLAY:', 'AI_BRANCH_TEST_REPLAY:']
      .find((prefix) => replaySource.startsWith(prefix));
    const sourceAt = replayPrefix ? replaySource.slice(replayPrefix.length) : snapshot.captured_at;
    const kpis = calculateSnapshotKpis(observations ?? []);

    const scenarioCode = String(snapshot.scenario_code ?? 'normal').toLowerCase();
    const regime = scenarioCode.startsWith('rain_peak') ? 'rain_peak'
      : scenarioCode.startsWith('rain') ? 'rain'
        : scenarioCode.startsWith('peak') ? 'peak' : 'normal';

    return {
      generatedAt: snapshot.captured_at,
      sourceAt,
      replayStep: String(snapshot.id),
      scenario: query.scenario ?? 'baseline',
      demoScenarioId: regime === 'rain_peak' ? 'rain-peak' : 'normal',
      regime,
      ai: {
        zoneContract: 'AI_ZONE_1_30',
        registeredZones: (aiZones ?? []).length,
        liveZones: liveZoneIds.size,
        forecastedZones: forecastedZoneIds.size,
        horizons: [...new Set((forecasts ?? []).map((forecast: any) => Number(forecast.horizon_min)))].sort(),
        modelVersion: latestForecast?.model_version ?? null,
        forecastMode: latestForecast?.forecast_mode ?? null,
        dataSource: latestForecast?.data_source ?? null,
        forecastAt: latestForecast?.forecast_at ?? null,
      },
      zones: (aiZones ?? []).map((zone: any) => {
        return mapAiZone(zone, observationsByZone.get(Number(zone.zone_id)), forecastsByZone.get(Number(zone.zone_id)));
      }),
      hotspots: [...forecastsByZone.entries()]
        .map(([zoneId, value]) => ({ zoneId, forecast: value.horizon15 ?? value.horizon30 }))
        .filter(({ forecast }) => Number(forecast?.predicted_demand ?? 0) > Number(forecast?.predicted_supply ?? 0))
        .sort((left, right) => (Number(right.forecast.predicted_demand) - Number(right.forecast.predicted_supply)) - (Number(left.forecast.predicted_demand) - Number(left.forecast.predicted_supply)))
        .map(({ zoneId }, index) => ({ zoneId: `AI-Z${String(zoneId).padStart(2, '0')}`, rank: index + 1, reason: 'ai_supply_gap', etaMinutes: 0, isPersistent: false })),
      kpis,
    };
  }

  private validateSnapshotWindow(query: Pick<SnapshotQueryDto, 'from' | 'to'>) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new UnprocessableEntityException('Snapshot from must be before or equal to snapshot to');
    }
  }

  async baselines() {
    const { data, error } = await this.db.client
      .from('supply_demand_snapshots')
      .select('id,captured_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(30);
    const snapshots = this.db.unwrap(data, error);
    if (!snapshots.length) throw new NotFoundException('No supply-demand snapshot exists');
    const snapshotIds = snapshots.map((snapshot: any) => snapshot.id);
    const { data: observations, error: observationsError } = await this.db.client
      .from('ai_zone_observations')
      .select('snapshot_id,data_status,demand_observed,idle_supply')
      .in('snapshot_id', snapshotIds);
    const observationRows = this.db.unwrap(observations, observationsError);
    const scores = snapshots.map((snapshot: any) => calculateSnapshotKpis(
      observationRows.filter((observation: any) => Number(observation.snapshot_id) === Number(snapshot.id)),
    ));
    const latest = snapshots[0];
    const average = (field: 'avgWaitProxy' | 'fulfillmentRate' | 'residualGap') =>
      scores.reduce((sum, score) => sum + score[field], 0) / scores.length;

    return [
      {
        id: 'no-action',
        label: 'Không điều phối',
        avgWaitProxy: scores[0].avgWaitProxy,
        fulfillmentRate: scores[0].fulfillmentRate,
        residualGap: scores[0].residualGap,
        frozenAt: latest.captured_at,
        source: `snapshot:${latest.id}`,
      },
      {
        id: 'historical-average',
        label: 'Trung bình lịch sử',
        avgWaitProxy: average('avgWaitProxy'),
        fulfillmentRate: average('fulfillmentRate'),
        residualGap: average('residualGap'),
        frozenAt: latest.captured_at,
        source: `${snapshots.length} snapshots gần nhất`,
      },
    ];
  }

  async listProposals() {
    const { data, error } = await this.db.client
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false });
    return this.db.unwrap(data, error).map(mapProposal);
  }

  async getProposal(id: string) {
    const { data, error } = await this.db.client.from('proposals').select('*').eq('id', id).maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!data) throw new NotFoundException(`Proposal ${id} was not found`);
    return mapProposal(data);
  }

  async reviseProposal(id: string, dto: ReviseProposalDto, actorId: string, requestId: string) {
    const { data: current, error: currentError } = await this.db.client
      .from('proposals')
      .select('status,source_plan,window_end_at')
      .eq('id', id)
      .maybeSingle();
    if (currentError) this.db.unwrap(null, currentError);
    if (!current) throw new NotFoundException(`Proposal ${id} was not found`);
    if (!['GENERATED', 'UNDER_REVIEW'].includes(current.status)) {
      throw new ConflictException({
        code: 'PROPOSAL_VERSION_CONFLICT',
        message: 'Proposal was changed by another operator.',
      });
    }
    if (!current.window_end_at || new Date(current.window_end_at).getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'STALE_PROPOSAL',
        message: 'Proposal input window has expired; run the model again before editing.',
      });
    }
    const fieldErrors = revisionFieldErrors({
      budgetLimit: dto.budgetLimit,
      currentSourcePlan: current.source_plan,
      moves: dto.sourcePlan.moves,
      relocationBonus: dto.bonusAmount,
      targetDriverCount: dto.targetDriverCount,
    });
    if (Object.keys(fieldErrors).length) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        details: { fieldErrors },
        message: 'Revision values are invalid.',
      });
    }
    const revisedSourcePlan = buildRevisedSourcePlan(current.source_plan, dto.sourcePlan.moves, dto.budgetLimit);
    const { data, error } = await this.db.client.rpc('revise_proposal', {
      p_proposal_id: id,
      p_actor_id: actorId,
      p_source_plan: revisedSourcePlan,
      p_target_driver_count: dto.targetDriverCount,
      p_campaign_duration_minutes: dto.campaignDurationMinutes,
      p_bonus_amount: dto.bonusAmount,
      p_zone_trip_bonus: dto.zoneTripBonus,
      p_fare_multiplier: dto.fareMultiplier,
      p_budget_limit: dto.budgetLimit,
      p_note: dto.note ?? null,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getProposal(String(data));
  }

  async reviewProposal(
    id: string,
    status: ReviewDecision,
    dto: ApproveProposalDto | RejectProposalDto,
    actorId: string,
    requestId: string,
  ) {
    const { data: current, error: currentError } = await this.db.client
      .from('proposals')
      .select('status,policy_status,window_end_at,bonus_amount,estimated_cost,target_driver_count,simulation_details,generator_type,parent_proposal_id,source_plan')
      .eq('id', id)
      .maybeSingle();
    if (currentError) this.db.unwrap(null, currentError);
    if (!current) throw new NotFoundException(`Proposal ${id} was not found`);
    const issue = proposalReviewIssue(current, status);
    if (issue?.kind === 'conflict') {
      throw new ConflictException({ code: issue.code, message: 'Proposal is stale or was changed by another operator.' });
    }
    if (issue?.kind === 'validation') {
      throw new UnprocessableEntityException({
        code: issue.code,
        details: { fieldErrors: { policyChecks: 'Proposal chưa vượt qua policy check.' } },
        message: 'Proposal policy check failed.',
      });
    }
    const { data, error } = await this.db.client.rpc('review_proposal', {
      p_proposal_id: id,
      p_actor_id: actorId,
      p_decision: status,
      p_note: dto.note ?? null,
      p_reason_code: 'reasonCode' in dto ? dto.reasonCode : null,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getProposal(String(data));
  }

  async activateProposal(id: string, dto: ActivateProposalDto, actorId: string, requestId: string) {
    const [{ data: proposal, error: proposalError }, { data: existingCampaign, error: existingCampaignError }] = await Promise.all([
      this.db.client.from('proposals')
        .select('status,policy_status,window_end_at,bonus_amount,estimated_cost,target_driver_count,simulation_details,generator_type,parent_proposal_id,source_plan')
        .eq('id', id)
        .maybeSingle(),
      this.db.client.from('campaigns').select('id').eq('proposal_id', id).maybeSingle(),
    ]);
    if (proposalError) this.db.unwrap(null, proposalError);
    if (!proposal) throw new NotFoundException(`Proposal ${id} was not found`);
    if (existingCampaignError) this.db.unwrap(null, existingCampaignError);
    if (existingCampaign) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Proposal already has a campaign.',
      });
    }
    if (!proposal.window_end_at || new Date(proposal.window_end_at).getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'STALE_PROPOSAL',
        message: 'Proposal input window has expired; run the model again before activation.',
      });
    }
    const operationalIssue = proposalActivationIssue(proposal);
    if (operationalIssue) {
      throw new UnprocessableEntityException({
        code: operationalIssue.code,
        message: 'Proposal cannot be activated because it has no valid operational incentive plan.',
      });
    }

    const { data, error } = await this.db.client.rpc('activate_proposal', {
      p_proposal_id: id,
      p_actor_id: actorId,
      p_response_mode: dto.responseMode,
      p_driver_ids: dto.driverIds ?? [],
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    const campaignId = typeof data === 'string' ? data : data?.campaign_id ?? data?.id;
    if (!campaignId) throw new UnprocessableEntityException('Activation did not return a campaign');
    return this.getCampaign(campaignId);
  }

  async listCampaigns() {
    const [campaignResult, offerResult, participationResult, tripResult] = await Promise.all([
      this.db.client.from('campaigns').select('*').order('created_at', { ascending: false }),
      this.db.client.from('driver_offers').select('*'),
      this.db.client.from('campaign_participations').select('*'),
      this.db.client.from('trips').select('campaign_id,status'),
    ]);
    const campaigns = this.db.unwrap(campaignResult.data, campaignResult.error);
    const offers = this.db.unwrap(offerResult.data, offerResult.error);
    const participations = this.db.unwrap(participationResult.data, participationResult.error);
    const trips = this.db.unwrap(tripResult.data, tripResult.error);
    return campaigns.map((row: any) =>
      mapCampaign(row, offers, participations, trips),
    );
  }

  async operationsReport(query: OperationsReportQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new UnprocessableEntityException('Report from must be before or equal to report to');
    }
    let campaignsQuery = this.db.client.from('campaigns').select('*').order('start_at', { ascending: false });
    if (query.campaignId) campaignsQuery = campaignsQuery.eq('id', query.campaignId);
    if (query.from) campaignsQuery = campaignsQuery.gte('start_at', query.from);
    if (query.to) campaignsQuery = campaignsQuery.lte('start_at', query.to);
    const { data: campaigns, error: campaignsError } = await campaignsQuery;
    const campaignRows = this.db.unwrap(campaigns, campaignsError);
    const campaignIds = campaignRows.map((campaign: any) => campaign.id);
    if (!campaignIds.length) return buildOperationsReport([], [], [], [], []);

    const [participationResult, tripResult, rewardResult, auditResult] = await Promise.all([
      this.db.client.from('campaign_participations').select('campaign_id,status').in('campaign_id', campaignIds),
      this.db.client.from('trips').select('campaign_id,status').in('campaign_id', campaignIds),
      this.db.client.from('reward_records').select('campaign_id,status,amount').in('campaign_id', campaignIds),
      this.db.client.from('audit_logs').select('entity_id').in('entity_id', campaignIds),
    ]);
    return buildOperationsReport(
      campaignRows,
      this.db.unwrap(participationResult.data, participationResult.error),
      this.db.unwrap(tripResult.data, tripResult.error),
      this.db.unwrap(rewardResult.data, rewardResult.error),
      this.db.unwrap(auditResult.data, auditResult.error),
    );
  }

  async getCampaign(id: string) {
    const all = await this.listCampaigns();
    const campaign = all.find((item: any) => item.id === id);
    if (!campaign) throw new NotFoundException(`Campaign ${id} was not found`);
    return campaign;
  }

  async cancelCampaign(id: string, actorId: string, requestId: string) {
    const { error } = await this.db.client.rpc('cancel_campaign', {
      p_campaign_id: id,
      p_actor_id: actorId,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getCampaign(id);
  }

  async listOffers(campaignId?: string) {
    let query = this.db.client.from('driver_offers').select('*, campaigns(*)').order('created_at', { ascending: false });
    if (campaignId) query = query.eq('campaign_id', campaignId);
    const { data, error } = await query;
    return this.db.unwrap(data, error).map(mapOffer);
  }

  async listDrivers() {
    const [{ data, error }, { data: profiles, error: profileError }] = await Promise.all([
      this.db.client.from('driver_states_api_v').select('*'),
      this.db.client.from('profiles').select('id,full_name').eq('role', 'DRIVER'),
    ]);
    this.db.unwrap(data, error);
    this.db.unwrap(profiles, profileError);
    const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.full_name]));
    return (data ?? []).map((row: any) => mapDriver({ ...row, driver_name: names.get(row.driver_id) }));
  }

  async getDriverView(id: string) {
    const [stateResult, offersResult, rewardsResult] = await Promise.all([
      this.db.client.from('driver_states_api_v').select('*').eq('driver_id', id).maybeSingle(),
      this.db.client
        .from('driver_offers')
        .select('*, campaigns(*)')
        .eq('driver_id', id)
        .order('created_at', { ascending: false }),
      this.db.client
        .from('reward_records')
        .select('amount,status')
        .eq('driver_id', id)
        .in('status', ['QUALIFIED', 'SIMULATED_PAID']),
    ]);
    if (stateResult.error) this.db.unwrap(null, stateResult.error);
    if (!stateResult.data) throw new NotFoundException(`Driver ${id} was not found`);
    const offers = this.db.unwrap(offersResult.data, offersResult.error).map(mapOffer);
    const rewards = this.db.unwrap(rewardsResult.data, rewardsResult.error);
    const { data: profile } = await this.db.client.from('profiles').select('full_name').eq('id', id).maybeSingle();
    const driver = {
      ...mapDriver({ ...stateResult.data, driver_name: profile?.full_name }),
      acceptedOfferIds: offers
        .filter((offer: any) => offer.status === 'Accepted')
        .map((offer: any) => offer.id),
      rewardTotal: rewards.reduce((total: number, reward: any) => total + Number(reward.amount ?? 0), 0),
    };
    return {
      driver,
      activeOffers: offers.filter((offer: any) => offer.status === 'Open'),
      acceptedOffers: offers.filter((offer: any) => offer.status === 'Accepted'),
      history: offers.filter((offer: any) => !['Open', 'Accepted'].includes(offer.status)),
    };
  }

  async listAudit(filters: AuditQueryDto) {
    if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) {
      throw new UnprocessableEntityException('Audit start date must be before end date');
    }
    const offset = (filters.page - 1) * filters.pageSize;
    let query = this.db.client
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (filters.entityId) {
      query = query.or(`entity_id.eq.${filters.entityId},metadata->>proposal_id.eq.${filters.entityId},metadata->>campaign_id.eq.${filters.entityId}`);
    }
    if (filters.entityType) query = query.in('entity_type', auditEntityAliases[filters.entityType] ?? [filters.entityType]);
    if (filters.action) query = query.in('action', auditActionAliases[filters.action] ?? [filters.action]);
    if (filters.actorType) query = query.eq('actor_type', filters.actorType.toUpperCase());
    if (filters.actorId) query = query.eq('actor_id', filters.actorId);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    const { data, error, count } = await query.range(offset, offset + filters.pageSize - 1);
    const items = this.db.unwrap(data, error).map((row: any) => ({
      id: String(row.id),
      planId: ['proposal', 'proposals'].includes(row.entity_type) ? row.entity_id : row.metadata?.proposal_id ?? '',
      entityType: canonicalAuditEntity(row.entity_type),
      entityId: row.entity_id,
      action: canonicalAuditAction(row.action),
      actor: row.actor_type ?? row.actor_id ?? 'SYSTEM',
      actorType: row.actor_type ?? 'SYSTEM',
      actorId: row.actor_id ?? null,
      occurredAt: row.created_at,
      detail: row.metadata?.detail ?? row.action,
    }));
    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.pageSize);
    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages,
      hasPreviousPage: filters.page > 1,
      hasNextPage: filters.page < totalPages,
    };
  }

  async updateDriverStatus(id: string, dto: DriverStatusDto, actorId: string, actorRole: string, requestId: string) {
    if (actorRole === 'DRIVER' && actorId !== id) {
      throw new UnprocessableEntityException('Drivers can only update their own status');
    }
    const { error: mutationError } = await this.db.client.rpc('update_driver_status', {
      p_driver_id: id,
      p_status: dto.status === 'online_idle' ? 'online' : dto.status,
      p_actor_id: actorId,
      p_actor_type: actorRole,
      p_request_id: requestId,
    });
    if (mutationError) this.db.unwrap(null, mutationError);
    const { data, error } = await this.db.client
      .from('driver_states')
      .select('*, profiles!driver_states_driver_id_fkey(full_name)')
      .eq('driver_id', id)
      .maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!data) throw new NotFoundException(`Driver ${id} was not found`);
    return mapDriver(data);
  }

  async respondToOffer(id: string, dto: OfferResponseDto, actorId: string, actorRole: string, requestId: string) {
    const offer = await this.rawOffer(id);
    const driverId = actorRole === 'DRIVER' ? actorId : offer.driver_id;
    const { error } = await this.db.client.rpc('respond_to_offer', {
      p_offer_id: id,
      p_driver_id: driverId,
      p_response: dto.response.toUpperCase(),
      p_actor_type: actorRole,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getOffer(id);
  }

  async expireOffer(id: string, actorId: string, requestId: string) {
    const { error } = await this.db.client.rpc('expire_offer', {
      p_offer_id: id,
      p_actor_id: actorId,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getOffer(id);
  }

  private async rawOffer(id: string) {
    const { data, error } = await this.db.client.from('driver_offers').select('*').eq('id', id).maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!data) throw new NotFoundException(`Offer ${id} was not found`);
    return data;
  }

  private async getOffer(id: string) {
    const { data, error } = await this.db.client
      .from('driver_offers')
      .select('*, campaigns(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!data) throw new NotFoundException(`Offer ${id} was not found`);
    return mapOffer(data);
  }

}
