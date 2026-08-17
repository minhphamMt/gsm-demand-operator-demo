import { ConflictException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';
import { assertNoActiveExecution } from './active-execution.guard';
import { buildRevisedSourcePlan } from './revision-source-plan';
import { deriveHotspots } from './hotspot-policy';
import { evaluateForecast, isGroundTruthDue, replayGroundTruthSourceAt } from './forecast-evaluation';
import { calculateSnapshotKpis, mapAiZone } from './snapshot.mapper';
import {
  ActivateProposalDto,
  ApproveProposalDto,
  AuditQueryDto,
  CancelCampaignDto,
  DispatchEventDto,
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
  constructor(private readonly db: SupabaseService, @Optional() private readonly ai?: AiService) {}

  async capabilities() {
    const enabled = (name: string, defaultValue: boolean) => {
      const value = process.env[name];
      return value === undefined ? defaultValue : value.toLowerCase() === 'true';
    };
    const { error: databaseError } = await this.db.client.from('profiles').select('id').limit(1);
    return {
      serverTime: new Date().toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      health: { api: 'UP', database: databaseError ? 'DEGRADED' : 'UP', ai: 'AVAILABLE', map: 'CLIENT' },
      capabilities: {
        forecastHorizons: { available: true, enabled: true, values: [5, 15, 30] },
        proposalReview: { available: true, enabled: true },
        dispatchRelease: { available: true, enabled: enabled('OPERATOR_DISPATCH_ENABLED', false) },
        dispatchReconciliation: { available: true, enabled: enabled('OPERATOR_DISPATCH_ENABLED', false) },
        activationRelease: { available: true, enabled: enabled('OPERATOR_ACTIVATION_ENABLED', true) },
        compensationSettlement: { available: true, enabled: enabled('OPERATOR_SETTLEMENT_ENABLED', false) },
        scenarioComparison: { available: true, enabled: true },
      },
    };
  }

  async operatorContext(operatorId: string) {
    const now = new Date().toISOString();
    const [scopeResult, shiftResult] = await Promise.all([
      this.db.client.from('operator_scopes').select('*').eq('operator_id', operatorId)
        .lte('valid_from', now).or(`valid_until.is.null,valid_until.gt.${now}`).order('valid_from', { ascending: false }).limit(1).maybeSingle(),
      this.db.client.from('operator_shifts').select('*').eq('operator_id', operatorId)
        .in('status', ['ACTIVE', 'HANDOVER']).lte('starts_at', now).gte('ends_at', now).order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (scopeResult.error) this.db.unwrap(null, scopeResult.error);
    if (shiftResult.error) this.db.unwrap(null, shiftResult.error);
    let tasks: any[] = [];
    if (shiftResult.data?.id) {
      const result = await this.db.client.from('handover_tasks').select('*')
        .eq('shift_id', shiftResult.data.id).in('status', ['OPEN', 'ACKNOWLEDGED']).order('created_at');
      tasks = this.db.unwrap(result.data, result.error);
    }
    return { operatorId, serverTime: now, timezone: 'Asia/Ho_Chi_Minh', scope: scopeResult.data, shift: shiftResult.data, handoverTasks: tasks };
  }

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
    let forecastQuery = this.db.client
      .from('ai_zone_forecasts')
      .select('*,forecast_runs!inner(id,status,completed_at,started_at,model_version,feature_version,policy_version,input_hash,forecast_mode,data_source,error_code,error_message)')
      .eq('snapshot_id', snapshot.id)
      .in('forecast_runs.status', ['COMPLETED', 'FALLBACK']);
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
    const registeredZoneCount = (aiZones ?? []).length;
    const forecastRunsById = new Map<string, { forecasts: any[]; horizon: number; run: any; zoneIds: Set<number> }>();
    for (const forecast of forecasts ?? []) {
      const runId = String(forecast.forecast_run_id);
      const current = forecastRunsById.get(runId) ?? {
        forecasts: [],
        horizon: Number(forecast.horizon_min),
        run: forecast.forecast_runs,
        zoneIds: new Set<number>(),
      };
      current.forecasts.push(forecast);
      current.zoneIds.add(Number(forecast.zone_id));
      forecastRunsById.set(runId, current);
    }
    const latestRunByHorizon = new Map<number, { forecasts: any[]; horizon: number; run: any; zoneIds: Set<number> }>();
    for (const candidate of forecastRunsById.values()) {
      const current = latestRunByHorizon.get(candidate.horizon);
      const currentTime = new Date(current?.run?.completed_at ?? 0).getTime();
      const candidateTime = new Date(candidate.run?.completed_at ?? 0).getTime();
      if (!current || candidateTime > currentTime) latestRunByHorizon.set(candidate.horizon, candidate);
    }
    const selectedRuns = [...latestRunByHorizon.values()]
      .filter((candidate) => candidate.zoneIds.size === registeredZoneCount);
    const latestForecasts = selectedRuns.flatMap((candidate) => candidate.forecasts);
    const forecastsByZone = new Map<number, { horizon5?: any; horizon15?: any; horizon30?: any }>();
    for (const forecast of latestForecasts) {
      const current = forecastsByZone.get(Number(forecast.zone_id)) ?? {};
      if (Number(forecast.horizon_min) === 5) current.horizon5 = forecast;
      if (Number(forecast.horizon_min) === 15) current.horizon15 = forecast;
      if (Number(forecast.horizon_min) === 30) current.horizon30 = forecast;
      forecastsByZone.set(Number(forecast.zone_id), current);
    }
    const liveZoneIds = new Set((observations ?? []).filter((observation: any) => observation.data_status === 'live').map((observation: any) => Number(observation.zone_id)));
    const forecastedZoneIds = new Set(latestForecasts.map((forecast: any) => Number(forecast.zone_id)));
    const latestRun = [...selectedRuns].sort((left, right) =>
      new Date(right.run?.completed_at ?? 0).getTime() - new Date(left.run?.completed_at ?? 0).getTime())[0];
    const latestForecast = latestRun?.forecasts[0];
    const previousSeverityByZone = latestRun
      ? await this.previousHotspotSeverities(snapshot, latestRun.horizon, registeredZoneCount)
      : new Map<string, 'High' | 'Critical'>();
    const replaySource = String((observations ?? [])[0]?.source_name ?? '');
    const replayPrefix = ['AI_PARQUET_REPLAY:', 'AI_BRANCH_TEST_REPLAY:']
      .find((prefix) => replaySource.startsWith(prefix));
    const sourceAt = replayPrefix ? replaySource.slice(replayPrefix.length) : snapshot.captured_at;
    const kpis = calculateSnapshotKpis(observations ?? []);
    const derivedHotspots = deriveHotspots((latestRun?.forecasts ?? []).map((forecast: any) => ({
      zoneId: `AI-Z${String(forecast.zone_id).padStart(2, '0')}`,
      forecastRunId: latestRun?.run?.id ?? forecast.forecast_run_id,
      demand: liveZoneIds.has(Number(forecast.zone_id)) ? Number(forecast.predicted_demand) : null,
      previousSeverity: previousSeverityByZone.get(`AI-Z${String(forecast.zone_id).padStart(2, '0')}`),
      supply: liveZoneIds.has(Number(forecast.zone_id)) ? Number(forecast.predicted_supply) : null,
    })));

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
        registeredZones: registeredZoneCount,
        liveZones: liveZoneIds.size,
        forecastedZones: forecastedZoneIds.size,
        horizons: selectedRuns.map((candidate) => candidate.horizon).sort(),
        forecastRuns: selectedRuns.map((candidate) => ({
          id: candidate.run?.id ?? candidate.forecasts[0]?.forecast_run_id,
          horizonMinutes: candidate.horizon,
          status: candidate.run?.status ?? null,
          modelVersion: candidate.run?.model_version ?? candidate.forecasts[0]?.model_version ?? null,
          featureVersion: candidate.run?.feature_version ?? null,
          policyVersion: candidate.run?.policy_version ?? null,
          inputHash: candidate.run?.input_hash ?? null,
          forecastMode: candidate.run?.forecast_mode ?? candidate.forecasts[0]?.forecast_mode ?? null,
          dataSource: candidate.run?.data_source ?? candidate.forecasts[0]?.data_source ?? null,
          forecastAt: candidate.forecasts[0]?.forecast_at ?? null,
          completedAt: candidate.run?.completed_at ?? null,
          zoneCount: candidate.zoneIds.size,
        })),
        modelVersion: latestRun?.run?.model_version ?? latestForecast?.model_version ?? null,
        forecastMode: latestRun?.run?.forecast_mode ?? latestForecast?.forecast_mode ?? null,
        dataSource: latestRun?.run?.data_source ?? latestForecast?.data_source ?? null,
        forecastAt: latestForecast?.forecast_at ?? null,
        forecastRunId: latestRun?.run?.id ?? latestForecast?.forecast_run_id ?? null,
        forecastStatus: latestRun?.run?.status ?? null,
      },
      zones: (aiZones ?? []).map((zone: any) => {
        return mapAiZone(zone, observationsByZone.get(Number(zone.zone_id)), forecastsByZone.get(Number(zone.zone_id)));
      }),
      hotspots: derivedHotspots.map((hotspot) => ({
        ...hotspot,
        reason: hotspot.reasonCodes.join(','),
        etaMinutes: 0,
      })),
      kpis,
    };
  }

  private async previousHotspotSeverities(snapshot: any, horizon: number, registeredZoneCount: number) {
    let previousSnapshotQuery = this.db.client
      .from('supply_demand_snapshots')
      .select('id')
      .lt('id', snapshot.id)
      .order('id', { ascending: false });
    if (snapshot.scenario_code) previousSnapshotQuery = previousSnapshotQuery.eq('scenario_code', snapshot.scenario_code);
    const { data: previousSnapshot, error: previousSnapshotError } = await previousSnapshotQuery.limit(1).maybeSingle();
    if (previousSnapshotError) this.db.unwrap(null, previousSnapshotError);
    if (!previousSnapshot) return new Map<string, 'High' | 'Critical'>();

    const { data, error } = await this.db.client
      .from('ai_zone_forecasts')
      .select('*,forecast_runs!inner(id,status,completed_at)')
      .eq('snapshot_id', previousSnapshot.id)
      .eq('horizon_min', horizon)
      .in('forecast_runs.status', ['COMPLETED', 'FALLBACK', 'SUPERSEDED']);
    const forecasts = this.db.unwrap(data, error) ?? [];
    const runs = new Map<string, { forecasts: any[]; completedAt: number; zoneIds: Set<number> }>();
    for (const forecast of forecasts) {
      const runId = String(forecast.forecast_run_id);
      const current = runs.get(runId) ?? {
        forecasts: [], completedAt: new Date(forecast.forecast_runs?.completed_at ?? 0).getTime(), zoneIds: new Set<number>(),
      };
      current.forecasts.push(forecast);
      current.zoneIds.add(Number(forecast.zone_id));
      runs.set(runId, current);
    }
    const latestComplete = [...runs.values()]
      .filter((run) => run.zoneIds.size === registeredZoneCount)
      .sort((left, right) => right.completedAt - left.completedAt)[0];
    if (!latestComplete) return new Map<string, 'High' | 'Critical'>();
    return new Map(deriveHotspots(latestComplete.forecasts.map((forecast: any) => ({
      zoneId: `AI-Z${String(forecast.zone_id).padStart(2, '0')}`,
      demand: Number(forecast.predicted_demand),
      supply: Number(forecast.predicted_supply),
    }))).map((hotspot) => [hotspot.zoneId, hotspot.severity] as const));
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
      .select('id,input_snapshot_id,status,source_plan,version,window_end_at')
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
    if (Number(current.version) !== dto.expectedVersion) {
      throw new ConflictException({
        code: 'PROPOSAL_VERSION_CONFLICT',
        message: 'Proposal was changed by another operator. Refresh before editing again.',
      });
    }
    await this.assertProposalSnapshotCurrent(current, id);
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
      p_expected_version: dto.expectedVersion,
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
    idempotencyKey = requestId,
  ) {
    // A retry may arrive after the first request has already changed the
    // proposal status. In that case, let the database validate the stored
    // command hash and replay its result before state validation sees a
    // terminal proposal.
    const { data: existingCommand, error: existingCommandError } = await this.db.client
      .from('command_records')
      .select('id')
      .eq('actor_id', actorId)
      .eq('command_type', 'PROPOSAL_REVIEW')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingCommandError) this.db.unwrap(null, existingCommandError);

    const { data: current, error: currentError } = await this.db.client
      .from('proposals')
      .select('id,input_snapshot_id,status,policy_status,window_end_at,bonus_amount,estimated_cost,target_driver_count,simulation_details,generator_type,parent_proposal_id,source_plan')
      .eq('id', id)
      .maybeSingle();
    if (currentError) this.db.unwrap(null, currentError);
    if (!current) throw new NotFoundException(`Proposal ${id} was not found`);
    if (!existingCommand) {
    if (status === 'APPROVED') await this.assertProposalSnapshotCurrent(current, id);
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
    }
    const { data, error } = await this.db.client.rpc('review_proposal', {
      p_proposal_id: id,
      p_actor_id: actorId,
      p_decision: status,
      p_note: dto.note ?? null,
      p_reason_code: 'reasonCode' in dto ? dto.reasonCode : null,
      p_request_id: requestId,
      p_idempotency_key: idempotencyKey,
      p_expected_version: dto.expectedVersion,
    });
    if (error) this.db.unwrap(null, error);
    return this.getProposal(String(data));
  }

  async activateProposal(id: string, dto: ActivateProposalDto, actorId: string, requestId: string) {
    const [{ data: proposal, error: proposalError }, { data: existingCampaign, error: existingCampaignError }] = await Promise.all([
      this.db.client.from('proposals')
        .select('id,input_snapshot_id,status,policy_status,window_end_at,bonus_amount,estimated_cost,target_driver_count,simulation_details,generator_type,parent_proposal_id,source_plan')
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
    await assertNoActiveExecution(this.db, id);
    // Snapshot freshness is checked at approval time. Once approved, the
    // immutable content hash/version is the release authority until the
    // proposal window expires. Requiring the input snapshot to remain the
    // newest here creates a race between the review and release gates every
    // time the five-minute replay ingests its next snapshot.
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

  private async assertProposalSnapshotCurrent(proposal: any, proposalId: string) {
    const inputSnapshotId = Number(proposal.input_snapshot_id);
    if (!Number.isInteger(inputSnapshotId)) return;
    const { data: latestSnapshot, error } = await this.db.client
      .from('supply_demand_snapshots')
      .select('id')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!latestSnapshot || Number(latestSnapshot.id) === inputSnapshotId) return;
    throw new ConflictException({
      code: 'STALE_PROPOSAL',
      message: `Proposal ${proposalId} uses an older snapshot; run the model again before continuing.`,
    });
  }

  async releaseDispatch(id: string, actorId: string, requestId: string, idempotencyKey = requestId) {
    if (process.env.OPERATOR_DISPATCH_ENABLED?.toLowerCase() !== 'true') {
      throw new UnprocessableEntityException({
        code: 'CAPABILITY_DISABLED',
        message: 'Live dispatch is installed but disabled until the limited-dispatch gate is enabled.',
      });
    }
    await assertNoActiveExecution(this.db, id);
    const { data, error } = await this.db.client.rpc('release_dispatch_batch', {
      p_proposal_id: id,
      p_actor_id: actorId,
      p_idempotency_key: idempotencyKey,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getDispatch(String(data));
  }

  async listDispatch() {
    const { data, error } = await this.db.client.from('dispatch_batches').select('*').order('released_at', { ascending: false });
    const batches = this.db.unwrap(data, error);
    return Promise.all(batches.map((batch: any) => this.getDispatch(batch.id)));
  }

  async getDispatch(id: string) {
    const [batchResult, moveResult, reconciliationResult] = await Promise.all([
      this.db.client.from('dispatch_batches').select('*').eq('id', id).maybeSingle(),
      this.db.client.from('dispatch_moves').select('*').eq('batch_id', id).order('created_at'),
      this.db.client.from('reconciliations').select('*').eq('batch_id', id).order('revision', { ascending: false }),
    ]);
    if (batchResult.error) this.db.unwrap(null, batchResult.error);
    if (!batchResult.data) throw new NotFoundException(`Dispatch batch ${id} was not found`);
    const moves = this.db.unwrap(moveResult.data, moveResult.error);
    const reconciliations = this.db.unwrap(reconciliationResult.data, reconciliationResult.error);
    return {
      id: batchResult.data.id,
      proposalId: batchResult.data.proposal_id,
      proposalVersion: batchResult.data.proposal_version,
      approvedContentHash: batchResult.data.approved_content_hash,
      status: batchResult.data.status,
      releasedAt: batchResult.data.released_at,
      requestId: batchResult.data.request_id,
      moves: moves.map((move: any) => ({
        id: move.id,
        sourceMoveKey: move.source_move_key,
        sourceZoneId: move.source_zone_id,
        targetZoneId: move.target_zone_id,
        plannedUnits: move.planned_units,
        acknowledgedUnits: move.acknowledged_units,
        arrivedUnits: move.arrived_units,
        availableUnits: move.available_units,
        failedUnits: move.failed_units,
        state: move.state,
        routeSource: move.route_source,
        etaMinutes: Number(move.eta_minutes ?? 0),
        distanceKm: Number(move.distance_km ?? 0),
      })),
      reconciliations: reconciliations.map((row: any) => ({
        id: row.id,
        revision: row.revision,
        plannedUnits: row.planned_units,
        acknowledgedUnits: row.acknowledged_units,
        arrivedUnits: row.arrived_units,
        availableUnits: row.available_units,
        failedUnits: row.failed_units,
        actualContribution: row.actual_contribution,
        residualGap: row.residual_gap === null ? null : Number(row.residual_gap),
        isSnapshotFresh: row.is_snapshot_fresh,
        createdAt: row.created_at,
      })),
    };
  }

  async cancelDispatch(id: string, reason: string, actorId: string, requestId: string) {
    const { data, error } = await this.db.client.rpc('cancel_dispatch_batch', {
      p_batch_id: id,
      p_actor_id: actorId,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getDispatch(String(data));
  }

  async recordDispatchEvent(batchId: string, moveId: string, dto: DispatchEventDto, actorId: string, requestId: string) {
    const { error } = await this.db.client.rpc('record_dispatch_event', {
      p_batch_id: batchId,
      p_move_id: moveId,
      p_event_key: dto.eventKey,
      p_event_type: dto.eventType,
      p_units: dto.units,
      p_occurred_at: dto.occurredAt,
      p_source: dto.source,
      p_payload: dto.payload ?? {},
      p_request_id: requestId,
      p_actor_id: actorId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getDispatch(batchId);
  }

  async retryDispatchMove(batchId: string, moveId: string, reason: string, actorId: string, requestId: string) {
    const { data: move, error: moveError } = await this.db.client.from('dispatch_moves')
      .select('planned_units,state').eq('id', moveId).eq('batch_id', batchId).maybeSingle();
    if (moveError) this.db.unwrap(null, moveError);
    if (!move) throw new NotFoundException(`Dispatch move ${moveId} was not found`);
    if (move.state !== 'FAILED') {
      throw new ConflictException({ code: 'DISPATCH_MOVE_NOT_RETRYABLE', message: 'Only a failed dispatch move can be retried.' });
    }
    return this.recordDispatchEvent(batchId, moveId, {
      eventKey: `retry:${requestId}`,
      eventType: 'RETRY_REQUESTED',
      occurredAt: new Date().toISOString(),
      payload: { reason },
      source: 'operator-retry',
      units: Number(move.planned_units),
    }, actorId, requestId);
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

    const [participationResult, tripResult, rewardResult, auditResult, ledgerResult] = await Promise.all([
      this.db.client.from('campaign_participations').select('campaign_id,status').in('campaign_id', campaignIds),
      this.db.client.from('trips').select('campaign_id,status').in('campaign_id', campaignIds),
      this.db.client.from('reward_records').select('campaign_id,status,amount').in('campaign_id', campaignIds),
      this.db.client.from('audit_logs').select('entity_id').in('entity_id', campaignIds),
      this.db.client.from('budget_ledger_entries').select('campaign_id,entry_type,amount').in('campaign_id', campaignIds),
    ]);
    return buildOperationsReport(
      campaignRows,
      this.db.unwrap(participationResult.data, participationResult.error),
      this.db.unwrap(tripResult.data, tripResult.error),
      this.db.unwrap(rewardResult.data, rewardResult.error),
      this.db.unwrap(auditResult.data, auditResult.error),
      undefined,
      this.db.unwrap(ledgerResult.data, ledgerResult.error),
    );
  }

  async getCampaign(id: string) {
    const all = await this.listCampaigns();
    const campaign = all.find((item: any) => item.id === id);
    if (!campaign) throw new NotFoundException(`Campaign ${id} was not found`);
    return campaign;
  }

  async cancelCampaign(id: string, dto: CancelCampaignDto, actorId: string, requestId: string) {
    const { error } = await this.db.client.rpc('cancel_campaign', {
      p_campaign_id: id,
      p_actor_id: actorId,
      p_reason: dto.reason,
      p_disposition: dto.disposition,
      p_policy_version: dto.policyVersion,
      p_request_id: requestId,
    });
    if (error) this.db.unwrap(null, error);
    return this.getCampaign(id);
  }

  async compareScenarios(proposalId: string, actorId: string) {
    const { data: proposal, error } = await this.db.client.from('proposals').select('*').eq('id', proposalId).maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!proposal) throw new NotFoundException(`Proposal ${proposalId} was not found`);
    const forecastRunId = proposal.source_plan?.forecast_run_id;
    if (!forecastRunId) {
      throw new UnprocessableEntityException({ code: 'SCENARIO_INPUT_MISSING', message: 'Proposal has no immutable forecast run.' });
    }
    const { data: run, error: runError } = await this.db.client.from('forecast_runs').select('*').eq('id', forecastRunId).maybeSingle();
    if (runError) this.db.unwrap(null, runError);
    if (!run) throw new UnprocessableEntityException({ code: 'SCENARIO_INPUT_MISSING', message: 'Forecast run was not found.' });
    const forecastEvaluation = await this.getForecastEvaluation(forecastRunId);
    const commonInputHash = createHash('sha256').update(JSON.stringify({
      snapshotId: proposal.input_snapshot_id,
      forecastRunId,
      modelVersion: run.model_version,
      policyVersion: run.policy_version,
    })).digest('hex');
    const { data: scenarioRun, error: scenarioError } = await this.db.client.from('scenario_runs').upsert({
      snapshot_id: proposal.input_snapshot_id,
      forecast_run_id: forecastRunId,
      model_version: run.model_version,
      policy_version: run.policy_version,
      common_input_hash: commonInputHash,
      status: 'SUCCEEDED',
      created_by: actorId,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'forecast_run_id,common_input_hash' }).select('*').single();
    if (scenarioError) this.db.unwrap(null, scenarioError);
    const details = proposal.simulation_details ?? {};
    const rows = [
      { type: 'NO_ACTION', metrics: details.metrics_before ?? {}, source: 'forecast_no_action' },
      { type: 'RELOCATION', metrics: details.metrics_after_relocation ?? details.metrics_after ?? {}, source: 'optimizer_estimate' },
      { type: 'ACTIVATION', metrics: details.metrics_after_activation_expected ?? {}, source: details.activation_policy?.accept_rate_source ?? 'policy_assumption' },
      { type: 'HYBRID', metrics: details.metrics_after_activation_expected ?? details.metrics_after ?? {}, source: 'optimizer_plus_policy_assumption' },
    ];
    const scenarioResults = rows.map((row) => ({
      scenario_run_id: scenarioRun.id,
      scenario_type: row.type,
      estimated_metrics: row.metrics,
      observed_metrics: null,
      uncertainty: { kind: 'model_quantile_or_policy_assumption', confidence: proposal.confidence ?? null },
      response_source: row.source,
    }));
    const { data: persisted, error: resultError } = await this.db.client.from('scenario_results')
      .upsert(scenarioResults, { onConflict: 'scenario_run_id,scenario_type' }).select('*');
    if (resultError) this.db.unwrap(null, resultError);
    return {
      id: scenarioRun.id,
      commonInputHash,
      snapshotId: String(proposal.input_snapshot_id),
      forecastRunId,
      modelVersion: run.model_version,
      policyVersion: run.policy_version,
      scenarios: (persisted ?? []).map((row: any) => ({
        type: row.scenario_type,
        estimatedMetrics: row.estimated_metrics,
        observedMetrics: row.observed_metrics,
        uncertainty: row.uncertainty,
        responseSource: row.response_source,
      })),
      forecastEvaluation,
      hasObservedRevenue: false,
      revenueNotice: 'Incremental revenue is unavailable until an observed revenue ledger exists.',
    };
  }

  private async getForecastEvaluation(forecastRunId: string) {
    const { data: forecastRows, error: forecastError } = await this.db.client.from('ai_zone_forecasts')
      .select('snapshot_id,zone_id,horizon_min,forecast_at,predicted_demand,predicted_supply,demand_p10,demand_p90,supply_p10,supply_p90')
      .eq('forecast_run_id', forecastRunId)
      .order('zone_id', { ascending: true });
    if (forecastError) this.db.unwrap(null, forecastError);
    const targetAt = forecastRows?.[0]?.forecast_at ? String(forecastRows[0].forecast_at) : null;
    if (!targetAt) return { status: 'PENDING_GROUND_TRUTH', targetAt: null, evaluatedZones: 0 };
    if (!isGroundTruthDue(targetAt)) {
      return { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };
    }

    const sourceSnapshotId = forecastRows?.[0]?.snapshot_id;
    const horizonMinutes = forecastRows?.[0]?.horizon_min;
    const { data: sourceObservation, error: sourceError } = await this.db.client.from('ai_zone_observations')
      .select('source_name')
      .eq('snapshot_id', sourceSnapshotId)
      .limit(1)
      .maybeSingle();
    if (sourceError) this.db.unwrap(null, sourceError);
    const replayTargetAt = replayGroundTruthSourceAt(sourceObservation?.source_name, horizonMinutes);
    if (!replayTargetAt) return { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };

    // forecast_at follows the displayed server clock. Ground truth must instead
    // advance from the immutable replay source bucket by the forecast horizon.
    const { data: candidates, error: candidateError } = await this.db.client.from('ai_zone_observations')
      .select('snapshot_id,source_name')
      .like('source_name', 'AI_PARQUET_REPLAY:%')
      .order('snapshot_id', { ascending: false })
      .limit(2000);
    if (candidateError) this.db.unwrap(null, candidateError);
    const targetMs = Date.parse(replayTargetAt);
    const targetSnapshotId = candidates?.find((row: any) => {
      const sourceAt = String(row.source_name ?? '').slice('AI_PARQUET_REPLAY:'.length);
      return Number.isFinite(targetMs) && Date.parse(sourceAt) === targetMs;
    })?.snapshot_id;
    if (!targetSnapshotId) {
      if (!this.ai) return { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };
      try {
        const replaySnapshot = await this.ai.replaySnapshotAt(replayTargetAt);
        return evaluateForecast(
          forecastRows ?? [],
          replaySnapshot.zones.map((zone) => ({ ...zone, data_status: 'live' })),
          targetAt,
        ) ?? { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };
      } catch {
        return { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };
      }
    }

    const { data: observations, error: observationError } = await this.db.client.from('ai_zone_observations')
      .select('zone_id,data_status,demand_observed,idle_supply')
      .eq('snapshot_id', targetSnapshotId)
      .order('zone_id', { ascending: true });
    if (observationError) this.db.unwrap(null, observationError);
    return evaluateForecast(forecastRows ?? [], observations ?? [], targetAt)
      ?? { status: 'PENDING_GROUND_TRUTH', targetAt, evaluatedZones: 0 };
  }

  async listNotifications(ownerId: string) {
    const { data, error } = await this.db.client.from('operator_notifications').select('*')
      .or(`owner_id.eq.${ownerId},owner_id.is.null`).order('created_at', { ascending: false }).limit(100);
    return this.db.unwrap(data, error).map((row: any) => ({
      id: row.id,
      ownerId: row.owner_id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      message: row.message,
      entityType: row.entity_type,
      entityId: row.entity_id,
      requestId: row.request_id,
      status: row.status,
      escalateAt: row.escalate_at,
      createdAt: row.created_at,
    }));
  }

  async acknowledgeNotification(id: string, ownerId: string, requestId: string) {
    const { data: before, error: beforeError } = await this.db.client.from('operator_notifications').select('*')
      .eq('id', id).or(`owner_id.eq.${ownerId},owner_id.is.null`).maybeSingle();
    if (beforeError) this.db.unwrap(null, beforeError);
    if (!before) throw new NotFoundException(`Notification ${id} was not found`);
    const { data, error } = await this.db.client.from('operator_notifications').update({
      owner_id: ownerId,
      status: 'ACKNOWLEDGED',
      read_at: before.read_at ?? new Date().toISOString(),
      acknowledged_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error) this.db.unwrap(null, error);
    const { error: auditError } = await this.db.client.from('audit_logs').insert({
      actor_id: ownerId,
      actor_type: 'OPERATOR',
      entity_type: 'notification',
      entity_id: id,
      action: 'NotificationAcknowledged',
      before_data: { status: before.status },
      after_data: { status: 'ACKNOWLEDGED' },
      request_id: requestId,
      correlation_id: requestId,
    });
    if (auditError) this.db.unwrap(null, auditError);
    return {
      id: data.id,
      ownerId: data.owner_id,
      severity: data.severity,
      category: data.category,
      title: data.title,
      message: data.message,
      entityType: data.entity_type,
      entityId: data.entity_id,
      requestId: data.request_id,
      status: data.status,
      escalateAt: data.escalate_at,
      createdAt: data.created_at,
    };
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
    const offset = filters.cursor ? 0 : (filters.page - 1) * filters.pageSize;
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
    if (filters.cursor) {
      let cursorAt: string;
      let cursorId: string;
      try {
        [cursorAt, cursorId] = Buffer.from(filters.cursor, 'base64url').toString('utf8').split('|');
      } catch {
        throw new UnprocessableEntityException('Audit cursor is invalid');
      }
      if (!cursorAt || !cursorId || Number.isNaN(new Date(cursorAt).getTime()) || !/^\d+$/.test(cursorId)) {
        throw new UnprocessableEntityException('Audit cursor is invalid');
      }
      query = query.or(`created_at.lt.${cursorAt},and(created_at.eq.${cursorAt},id.lt.${cursorId})`);
    }
    const { data, error, count } = await query.range(offset, offset + filters.pageSize - 1);
    const rows = this.db.unwrap(data, error);
    const items = rows.map((row: any) => ({
      id: String(row.id),
      planId: ['proposal', 'proposals'].includes(row.entity_type) ? row.entity_id : row.metadata?.proposal_id ?? '',
      entityType: canonicalAuditEntity(row.entity_type),
      entityId: row.entity_id,
      action: canonicalAuditAction(row.action),
      actor: row.actor_type ?? row.actor_id ?? 'SYSTEM',
      actorType: row.actor_type ?? 'SYSTEM',
      actorId: row.actor_id ?? null,
      requestId: row.request_id ?? row.metadata?.request_id ?? null,
      correlationId: row.correlation_id ?? null,
      entityVersion: row.entity_version ?? null,
      entityHash: row.entity_hash ?? null,
      occurredAt: row.created_at,
      detail: row.metadata?.detail ?? row.action,
    }));
    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.pageSize);
    const last = rows.at(-1);
    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages,
      hasPreviousPage: filters.page > 1,
      hasNextPage: filters.cursor ? rows.length === filters.pageSize : filters.page < totalPages,
      nextCursor: rows.length === filters.pageSize && last
        ? Buffer.from(`${last.created_at}|${last.id}`).toString('base64url')
        : null,
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
