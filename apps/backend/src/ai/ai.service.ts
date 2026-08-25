import { createHash } from 'node:crypto';
import { BadGatewayException, Injectable, UnprocessableEntityException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';
import { assertNoActiveExecution } from '../operator/active-execution.guard';

type DbRow = Record<string, unknown>;
type AiForecastZone = {
  zone_id: number;
  predicted_demand: number;
  predicted_supply: number;
  demand_p10: number;
  demand_p90: number;
  supply_p10: number;
  supply_p90: number;
  confidence: number | null;
};
type AiDecision = {
  data_source: string;
  forecast_mode: string;
  planning_status?: 'not_required' | 'optimizer_evaluated';
  reason_code?: string | null;
  risk_zones?: Array<{ zone_id: number; gap: number; required_units: number; risk_basis: string }>;
  activation_policy: { incentive_amount: number; incentive_budget_cap: number; overbooking_factor: number; assumed_accept_rate: number; offer_ttl_minutes?: number };
  activation_recommendation: {
    target_zones: Array<{ zone_id: number; gap_remaining: number; requested_offers: number; expected_units_gained: number; expected_gap_remaining: number }>;
    total_requested_offers: number;
    total_expected_units_gained: number;
    total_expected_gap_remaining: number;
    projected_gap_reduction_pct: number;
    worst_case_commitment: number;
    constrained_by_budget: boolean;
    accept_rate_source: string;
  };
  forecast: { forecast_ts: string; horizon_min: number; model_version: string; regime: string; zones: AiForecastZone[] };
  hotspots: {
    hotspots: Array<{ zone_id: number; gap: number }>;
    surplus_zones?: Array<{ zone_id: number; surplus: number; idle_supply_current: number }>;
  };
  simulation?: {
    metrics_before: { unmet_demand: number; avg_wait_proxy: number; est_cancel_rate: number; total_demand: number };
    metrics_after_relocation: { unmet_demand: number; avg_wait_proxy: number; est_cancel_rate: number; total_demand: number };
    basis: string;
  };
  plan: { moves: Array<Record<string, unknown> & { to_zone?: number; units_to_move?: number; drivers?: number }>; residual_gap: Array<{ zone_id: number; gap_remaining: number; suggested_activation: number }>; plan_totals: { total_cost: number; budget_cap: number }; source_capacities?: Array<{ zone_id: number; movable_units: number }>; relocation_targets?: Array<{ zone_id: number; gap: number; required_units: number; is_policy_hotspot: boolean; target_basis?: string }>; warnings: Array<Record<string, unknown>> };
};

type DatasetRegime = 'normal' | 'peak' | 'rain' | 'rain_peak';
type DatasetSnapshot = {
  dataset: string;
  source_at: string;
  regime: DatasetRegime;
  zones: Array<{
    zone_id: number;
    demand_observed: number;
    idle_supply: number;
    enroute_supply: number;
    rain_mm_h: number;
    rain_forecast_15: number;
    rain_forecast_30: number;
    peak_flag: number;
    holiday_flag: number;
  }>;
};

const replaySourcePrefixes = ['AI_PARQUET_REPLAY:', 'AI_BRANCH_TEST_REPLAY:'] as const;

export function replaySourceAtIso(sourceAt: unknown) {
  const parsed = new Date(String(sourceAt));
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCMinutes() % 5 || parsed.getUTCSeconds() || parsed.getUTCMilliseconds()) {
    throw new UnprocessableEntityException({
      code: 'AI_REPLAY_SOURCE_INVALID',
      message: 'Replay source timestamp must align to a valid 5-minute bucket.',
    });
  }
  return parsed.toISOString();
}

/**
 * Frozen replay provenance identifies model input, but it must not determine
 * whether a newly generated operational proposal is already expired. Proposal
 * validity is anchored to the current server-side five-minute operating bucket.
 */
export function proposalOperationalWindow(horizonMinutes: number, now = new Date()) {
  const startsAt = new Date(now);
  startsAt.setUTCSeconds(0, 0);
  startsAt.setUTCMinutes(startsAt.getUTCMinutes() - (startsAt.getUTCMinutes() % 5));
  const endsAt = new Date(startsAt.getTime() + horizonMinutes * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function capturedAtNow() {
  const capturedAt = new Date();
  capturedAt.setUTCSeconds(0, 0);
  capturedAt.setUTCMinutes(capturedAt.getUTCMinutes() - (capturedAt.getUTCMinutes() % 5));
  return capturedAt;
}

const requiredLiveFields = [
  'demand_observed', 'idle_supply', 'enroute_supply', 'rain_mm_h',
  'rain_forecast_15', 'rain_forecast_30', 'peak_flag', 'holiday_flag',
] as const;

@Injectable()
export class AiService {
  private readonly aiServiceUrl = (process.env.AI_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

  constructor(private readonly db: SupabaseService) {}

  async status() {
    return this.request('/health', { method: 'GET' });
  }

  async runNext(horizonMinutes: 5 | 10 | 15, regime?: DatasetRegime) {
    await assertNoActiveExecution(this.db);
    const snapshot = await this.ingestNext(regime);
    const decision = await this.generate(horizonMinutes, snapshot.id, false, true);
    return { snapshot, decision };
  }

  async optimize(snapshotId: number, horizonMinutes: 5 | 10 | 15) {
    await assertNoActiveExecution(this.db);
    const decision = await this.generate(horizonMinutes, snapshotId, true, true);
    return { decision };
  }

  async forecast(snapshotId: number, horizonMinutes: 5 | 10 | 15) {
    await assertNoActiveExecution(this.db);
    const refreshedSnapshot = await this.refreshReplaySnapshot(snapshotId);
    const decision = await this.generate(horizonMinutes, Number(refreshedSnapshot.id), false, true);
    return { snapshot: refreshedSnapshot, decision };
  }

  async generateForOperator(horizonMinutes: 5 | 10 | 15) {
    await assertNoActiveExecution(this.db);
    return this.generate(horizonMinutes);
  }

  async runReplay(sourceAt: string) {
    const dataset = await this.replaySnapshotAt(sourceAt);
    const snapshot = await this.ingestExact(dataset);
    return { snapshot };
  }

  async replaySnapshotAt(sourceAt: string) {
    return this.request<DatasetSnapshot>('/api/v1/datasets/snapshots/at', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_at: sourceAt }),
    });
  }

  async replayWindow(sourceAt: string) {
    return this.request<{ steps: Array<{ source_at: string; mean_rain_mm_h: number }> }>('/api/v1/datasets/snapshots/window', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_at: sourceAt }),
    });
  }

  async generate(horizonMinutes: 5 | 10 | 15, snapshotId?: number, persistProposal = true, persistForecast = persistProposal) {
    const inferenceStartedAt = Date.now();
    let snapshotQuery = this.db.client.from('supply_demand_snapshots').select('*');
    snapshotQuery = snapshotId
      ? snapshotQuery.eq('id', snapshotId)
      : snapshotQuery.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
    const { data: snapshot, error: snapshotError } = await snapshotQuery.maybeSingle();
    if (snapshotError) this.db.unwrap(null, snapshotError);
    if (!snapshot) throw new UnprocessableEntityException('No live snapshot is available for AI inference');

    const { data: observations, error: observationsError } = await this.db.client
      .from('ai_zone_observations')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .order('zone_id');
    const zones = this.validateLiveZones(this.db.unwrap(observations, observationsError));
    const replaySourceAt = this.replaySourceAt(this.db.unwrap(observations, observationsError));
    const capturedAt = new Date(String(snapshot.captured_at));
    if (capturedAt.getUTCMinutes() % 5 || capturedAt.getUTCSeconds() || capturedAt.getUTCMilliseconds()) {
      throw new UnprocessableEntityException({ code: 'AI_SNAPSHOT_OFF_GRID', message: 'Snapshot timestamp must align to a 5-minute bucket.' });
    }

    const inputPayload = {
      snapshot_id: snapshot.id,
      t: capturedAt.toISOString(),
      horizon_min: horizonMinutes,
      data_source: `supabase:ai_zone_observations:${snapshot.id}`,
      replay_source_at: replaySourceAt,
      zones,
    };
    const { data: modelInput, error: inputError } = await this.db.client.from('model_inputs').insert({
      source_snapshot_id: snapshot.id,
      snapshot_time: snapshot.captured_at,
      input_payload: inputPayload,
      status: 'PROCESSING',
      sent_at: new Date().toISOString(),
    }).select('id').single();
    if (inputError) this.db.unwrap(null, inputError);
    if (!modelInput) throw new UnprocessableEntityException('Model input ledger could not be created');
    const forecastRunId = await this.startForecastRun(snapshot, inputPayload, horizonMinutes);

    try {
      const decision = await this.request<AiDecision>('/api/v1/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inputPayload),
      });
      if (replaySourceAt && decision.forecast_mode !== 'trained_model_replay') {
        throw new UnprocessableEntityException({
          code: 'REPLAY_MODEL_REQUIRED',
          message: 'Replay input requires the trained model; fallback output was rejected.',
        });
      }
      const shouldPersistPlan = persistProposal && decision.planning_status !== 'not_required';
      const optimizerRunId = shouldPersistPlan
        ? await this.persistOptimizerRun(forecastRunId, String(modelInput.id), decision, Date.now() - inferenceStartedAt)
        : undefined;
      if (persistForecast && shouldPersistPlan) {
        await this.persistDecision(snapshot, decision, String(modelInput.id), forecastRunId, optimizerRunId);
      } else {
        if (persistForecast) await this.persistForecast(snapshot, decision, forecastRunId);
        if (shouldPersistPlan) await this.persistProposal(snapshot, decision, String(modelInput.id), forecastRunId, optimizerRunId);
      }
      await this.completeForecastRun(forecastRunId, decision);
      const { error: completeError } = await this.db.client.from('model_inputs').update({
        status: 'COMPLETED',
        error_message: null,
      }).eq('id', modelInput.id);
      if (completeError) this.db.unwrap(null, completeError);
      return decision;
    } catch (cause) {
      await this.failForecastRun(forecastRunId, cause);
      await this.db.client.from('model_inputs').update({
        status: 'FAILED',
        error_message: cause instanceof Error ? cause.message.slice(0, 1000) : 'Unknown inference failure',
      }).eq('id', modelInput.id);
      throw cause;
    }
  }

  private replaySourceAt(rows: DbRow[]) {
    const sources = [...new Set(rows.map((row) => String(row.source_name ?? '')))];
    if (sources.length !== 1) return undefined;
    const prefix = replaySourcePrefixes.find((candidate) => sources[0].startsWith(candidate));
    if (!prefix) return undefined;
    const raw = sources[0].slice(prefix.length).replace(' ', 'T');
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCMinutes() % 5 || parsed.getUTCSeconds() || parsed.getUTCMilliseconds()) {
      throw new UnprocessableEntityException({
        code: 'AI_REPLAY_SOURCE_INVALID',
        message: 'Simulation replay provenance must contain a valid 5-minute timestamp.',
      });
    }
    return parsed.toISOString();
  }

  private async ingestNext(regime?: DatasetRegime) {
    const { data: latestReplay, error: replayError } = await this.db.client
      .from('supply_demand_snapshots')
      .select('source_at')
      .not('source_at', 'is', null)
      .order('source_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (replayError) this.db.unwrap(null, replayError);
    const afterSourceAt = latestReplay?.source_at ? String(latestReplay.source_at) : undefined;
    const dataset = await this.request<DatasetSnapshot>('/api/v1/datasets/snapshots/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ after_source_at: afterSourceAt, regime }),
    });
    return this.ingestReplayDataset(dataset);
  }

  private async ingestExact(dataset: DatasetSnapshot) {
    return this.ingestReplayDataset(dataset);
  }

  private async refreshReplaySnapshot(snapshotId: number) {
    const { data: snapshot, error } = await this.db.client
      .from('supply_demand_snapshots')
      .select('id,source_at,data_source')
      .eq('id', snapshotId)
      .maybeSingle();
    if (error) this.db.unwrap(null, error);
    if (!snapshot || snapshot.data_source !== 'AI_PARQUET_DATASET' || !snapshot.source_at) {
      return snapshot ?? { id: snapshotId };
    }
    const dataset = await this.replaySnapshotAt(String(snapshot.source_at));
    return this.ingestExact(dataset);
  }

  private async ingestReplayDataset(dataset: DatasetSnapshot) {
    if (dataset.zones.length !== 30 || new Set(dataset.zones.map((zone) => zone.zone_id)).size !== 30) {
      throw new UnprocessableEntityException('Dataset snapshot must contain exactly 30 unique zones');
    }
    const sourceAt = replaySourceAtIso(dataset.source_at);
    const capturedAt = capturedAtNow();
    const totalDemand = dataset.zones.reduce((sum, zone) => sum + zone.demand_observed, 0);
    const totalSupply = dataset.zones.reduce((sum, zone) => sum + zone.idle_supply + zone.enroute_supply, 0);
    const { data, error } = await this.db.client.rpc('ingest_replay_snapshot', {
      p_captured_at: capturedAt.toISOString(),
      p_source_at: sourceAt,
      p_scenario_code: dataset.regime.toUpperCase(),
      p_total_demand: totalDemand,
      p_total_supply: totalSupply,
      p_zones: dataset.zones,
    });
    if (error) this.db.unwrap(null, error);
    const snapshot = Array.isArray(data) ? data[0] : data;
    if (!snapshot) throw new UnprocessableEntityException('Dataset snapshot could not be persisted');
    return { ...snapshot, dataset: dataset.dataset, sourceAt, regime: dataset.regime };
  }

  private validateLiveZones(rows: DbRow[]) {
    const ids = rows.map((row) => Number(row.zone_id));
    const expectedIds = Array.from({ length: 30 }, (_, index) => index + 1);
    const missingZones = expectedIds.filter((zoneId) => !ids.includes(zoneId));
    const duplicateZones = ids.filter((zoneId, index) => ids.indexOf(zoneId) !== index);
    const incomplete = rows.flatMap((row) => {
      const missingFields = requiredLiveFields.filter((field) => row[field] === null || row[field] === undefined);
      return row.data_status !== 'live' || missingFields.length
        ? [{ zoneId: Number(row.zone_id), dataStatus: row.data_status, missingFields }]
        : [];
    });
    if (rows.length !== 30 || missingZones.length || duplicateZones.length || incomplete.length) {
      throw new UnprocessableEntityException({
        code: 'AI_ZONE_DATA_INCOMPLETE',
        message: 'AI requires exactly 30 complete live zone records for the selected snapshot.',
        details: { rowCount: rows.length, missingZones, duplicateZones: [...new Set(duplicateZones)], incomplete },
      });
    }
    return rows.map((row) => ({
      zone_id: Number(row.zone_id),
      demand_observed: Number(row.demand_observed),
      idle_supply: Number(row.idle_supply),
      enroute_supply: Number(row.enroute_supply),
      rain_mm_h: Number(row.rain_mm_h),
      rain_forecast_15: Number(row.rain_forecast_15),
      rain_forecast_30: Number(row.rain_forecast_30),
      peak_flag: Number(row.peak_flag),
      holiday_flag: Number(row.holiday_flag),
    }));
  }

  private async startForecastRun(snapshot: DbRow, inputPayload: DbRow, horizonMinutes: number) {
    const inputHash = createHash('sha256').update(JSON.stringify(inputPayload)).digest('hex');
    const { data, error } = await this.db.client.from('forecast_runs').insert({
      snapshot_id: snapshot.id,
      horizon_min: horizonMinutes,
      model_version: 'PENDING',
      feature_version: 'ai-zone-observation-v1',
      policy_version: 'policy-v1',
      input_hash: inputHash,
      status: 'RUNNING',
    }).select('id').single();
    if (error) this.db.unwrap(null, error);
    if (!data?.id) throw new UnprocessableEntityException('Forecast run could not be created');
    return String(data.id);
  }

  private async completeForecastRun(runId: string, decision: AiDecision) {
    const { error } = await this.db.client.from('forecast_runs').update({
      completed_at: new Date().toISOString(),
      data_source: decision.data_source,
      forecast_mode: decision.forecast_mode,
      model_version: decision.forecast.model_version,
      status: decision.forecast_mode.includes('fallback') ? 'FALLBACK' : 'COMPLETED',
    }).eq('id', runId);
    if (error) this.db.unwrap(null, error);
  }

  private async failForecastRun(runId: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Unknown inference failure';
    const { error } = await this.db.client.from('forecast_runs').update({
      completed_at: new Date().toISOString(),
      error_code: cause instanceof BadGatewayException ? 'AI_SERVICE_UNAVAILABLE' : 'FORECAST_FAILED',
      error_message: message.slice(0, 1000),
      status: 'FAILED',
    }).eq('id', runId);
    if (error) this.db.unwrap(null, error);
  }

  private async persistForecast(snapshot: DbRow, decision: AiDecision, forecastRunId: string) {
    const forecastRows = decision.forecast.zones.map((zone) => ({
      ...zone,
      forecast_run_id: forecastRunId,
      snapshot_id: snapshot.id,
      horizon_min: decision.forecast.horizon_min,
      forecast_at: decision.forecast.forecast_ts,
      regime: decision.forecast.regime,
      model_version: decision.forecast.model_version,
      forecast_mode: decision.forecast_mode,
      data_source: decision.data_source,
    }));
    const { error: forecastError } = await this.db.client
      .from('ai_zone_forecasts')
      .insert(forecastRows);
    if (forecastError) this.db.unwrap(null, forecastError);
  }

  private async persistOptimizerRun(forecastRunId: string, modelInputId: string, decision: AiDecision, runtimeMs: number) {
    const hasAction = decision.plan.moves.length > 0 || decision.activation_recommendation.total_requested_offers > 0;
    const status = decision.forecast_mode.includes('fallback') ? 'FALLBACK' : hasAction ? 'SUCCEEDED' : 'INFEASIBLE';
    const inputHash = createHash('sha256').update(JSON.stringify({
      forecastRunId,
      hotspots: decision.hotspots,
      activationPolicy: decision.activation_policy,
    })).digest('hex');
    const noSolution = decision.plan.warnings.find((warning) => warning.code === 'NO_SOLUTION');
    const { data, error } = await this.db.client.from('optimizer_runs').insert({
      forecast_run_id: forecastRunId,
      model_input_id: modelInputId,
      input_hash: inputHash,
      solver_name: 'greedy-relocation',
      solver_version: 'v1',
      policy_version: 'policy-v1',
      status,
      fallback_reason: status === 'FALLBACK' ? decision.forecast_mode : null,
      infeasible_reason: status === 'INFEASIBLE' ? String(noSolution?.message ?? 'No safe improving action') : null,
      runtime_ms: runtimeMs,
      completed_at: new Date().toISOString(),
    }).select('id').single();
    if (error) this.db.unwrap(null, error);
    if (!data?.id) throw new UnprocessableEntityException('Optimizer run could not be persisted');
    return String(data.id);
  }

  private async persistDecision(snapshot: DbRow, decision: AiDecision, modelInputId: string | undefined, forecastRunId: string, optimizerRunId?: string) {
    await this.persistForecast(snapshot, decision, forecastRunId);
    await this.persistProposal(snapshot, decision, modelInputId, forecastRunId, optimizerRunId);
  }

  private async persistProposal(snapshot: DbRow, decision: AiDecision, modelInputId?: string, forecastRunId?: string, optimizerRunId?: string) {
    const proposalWindow = proposalOperationalWindow(decision.forecast.horizon_min);
    const activation = decision.activation_recommendation;
    const isRiskAdvisory = decision.reason_code === 'RISK_ADVISORY_PROPOSAL';
    const actionableTargetZoneIds = [...new Set([
      ...decision.plan.moves.map((move) => Number(move.to_zone)).filter((zoneId) => Number.isInteger(zoneId)),
      ...activation.target_zones.map((target) => target.zone_id),
    ])];
    // A proposal/campaign target is an actionable destination, not every zone
    // that the detector happened to flag. Persisting all hotspots makes the
    // campaign label/geofence misleading and can overflow the DB display name.
    const targetZoneIds = actionableTargetZoneIds.length
      ? actionableTargetZoneIds
      : [...new Set(decision.hotspots.hotspots.map((hotspot) => hotspot.zone_id))];
    const unmetBefore = decision.plan.relocation_targets?.reduce((sum, target) => sum + Math.max(0, target.gap), 0)
      ?? decision.hotspots.hotspots.reduce((sum, hotspot) => sum + Math.max(0, hotspot.gap), 0);
    const unmetAfterRelocation = decision.plan.residual_gap.reduce((sum, gap) => sum + gap.gap_remaining, 0);
    const planningDemand = decision.simulation?.metrics_before.total_demand
      ?? decision.forecast.zones.reduce((sum, zone) => sum + zone.predicted_demand, 0);
    const fulfillmentRate = (unmet: number) => planningDemand > 0
      ? Math.max(0, (1 - unmet / planningDemand) * 100)
      : 100;
    const requestedOfferCount = activation.total_requested_offers;
    const incentiveAmount = Number(decision.activation_policy.incentive_amount);
    const eligibleOfferCapacity = await this.eligibleDriverCount();
    const offerCount = Math.min(requestedOfferCount, eligibleOfferCapacity);
    const availableOfferRatio = requestedOfferCount > 0 ? offerCount / requestedOfferCount : 0;
    const effectiveActivationGain = Math.min(
      unmetAfterRelocation,
      activation.total_expected_units_gained * availableOfferRatio,
    );
    const targetDriverCount = Math.min(offerCount, Math.ceil(effectiveActivationGain));
    const unmetAfterActivation = Math.max(0, unmetAfterRelocation - effectiveActivationGain);
    const hasDirectRelocation = decision.plan.moves.length > 0;
    const relocationImproves = hasDirectRelocation && unmetAfterRelocation < unmetBefore;
    const activationImproves = targetDriverCount > 0
      && incentiveAmount > 0
      && activation.total_expected_units_gained > 0
      && unmetAfterActivation < unmetAfterRelocation;
    const isOperationalPlan = relocationImproves || activationImproves;
    const planMode = relocationImproves && activationImproves
      ? 'HYBRID'
      : relocationImproves
        ? 'RELOCATION'
        : 'ACTIVATION_ONLY';
    const estimatedIncentiveCost = offerCount * incentiveAmount;
    const proposalWarnings = decision.plan.warnings.map((warning) =>
      !hasDirectRelocation && isOperationalPlan && warning.code === 'NO_SOLUTION'
        ? {
            ...warning,
            code: 'NO_RELOCATION_SOURCE',
            message: 'Không có zone dư an toàn để điều chuyển trực tiếp; phương án chuyển sang kích hoạt tài xế.',
          }
        : warning,
    );
    const allocatedBySource = new Map<number, number>();
    for (const move of decision.plan.moves) {
      const sourceZoneId = Number(move.from_zone);
      const quantity = Number(move.units_to_move ?? move.drivers ?? 0);
      if (Number.isInteger(sourceZoneId) && Number.isFinite(quantity)) {
        allocatedBySource.set(sourceZoneId, (allocatedBySource.get(sourceZoneId) ?? 0) + quantity);
      }
    }
    const capacityBySource = new Map((decision.plan.source_capacities ?? [])
      .map((source) => [source.zone_id, source.movable_units] as const));
    // The AI response exposes raw surplus, not the optimizer's post-policy
    // movable capacity. Persist that evidence, but cap manual edits at the
    // quantity the optimizer actually allocated instead of inventing capacity.
    const candidateSourceZones = (decision.hotspots.surplus_zones ?? []).map((source) => ({
      zoneId: `AI-Z${String(source.zone_id).padStart(2, '0')}`,
      availableSupply: capacityBySource.get(source.zone_id) ?? allocatedBySource.get(source.zone_id) ?? 0,
      modelSurplus: source.surplus,
      idleSupplyCurrent: source.idle_supply_current,
      capacitySource: 'optimizer_allocation',
    }));
    const sourceSupply = new Map((decision.hotspots.surplus_zones ?? [])
      .map((source) => [source.zone_id, source.idle_supply_current] as const));
    const withdrawnBySource = new Map<number, number>();
    const persistedMoves = decision.plan.moves.map((move, index) => {
      const sourceZoneId = Number(move.from_zone);
      const quantity = Number(move.units_to_move ?? move.drivers ?? 0);
      const withdrawn = (withdrawnBySource.get(sourceZoneId) ?? 0) + quantity;
      withdrawnBySource.set(sourceZoneId, withdrawn);
      const idleSupply = sourceSupply.get(sourceZoneId);
      return {
        ...move,
        id: String(move.id ?? `MV-${String(index + 1).padStart(2, '0')}`),
        ...(idleSupply === undefined ? {} : { source_supply_after: Math.max(0, idleSupply - withdrawn) }),
      };
    });
    const { data: proposal, error: proposalError } = await this.db.client.from('proposals').insert({
      optimizer_run_id: optimizerRunId ?? null,
      generator_type: 'AGENT',
      generator_version: decision.forecast.model_version,
      // A result without a safe relocation or activation improvement is retained
      // as evidence, but must never enter the human approval queue.
      status: isOperationalPlan ? 'UNDER_REVIEW' : 'FAILED_GENERATION',
      policy_status: isOperationalPlan ? 'PASSED' : 'FAILED',
      version: 1,
      input_snapshot_id: snapshot.id,
      target_zone_ids: targetZoneIds.length ? targetZoneIds : null,
      source_plan: {
        ...decision.plan,
        forecast_run_id: forecastRunId ?? null,
        model_input_id: modelInputId ?? null,
        moves: persistedMoves,
        activation_recommendation: activation,
        candidate_source_zones: candidateSourceZones,
      },
      target_driver_count: targetDriverCount,
      offer_count: offerCount,
      bonus_amount: incentiveAmount,
      fare_multiplier: 1,
      estimated_cost: estimatedIncentiveCost,
      simulation_details: {
        title: isRiskAdvisory
          ? `Khuyến nghị sớm theo risk p90 · ${decision.forecast.horizon_min} phút`
          : `AI điều phối ${decision.forecast.horizon_min} phút`,
        scenario_id: decision.forecast.regime.replace('_', '-'),
        warnings: proposalWarnings,
        metrics_before: {
          unmet_demand: unmetBefore,
          fulfillment_rate: fulfillmentRate(unmetBefore),
          avg_wait_proxy: decision.simulation?.metrics_before.avg_wait_proxy ?? null,
          est_cancel_rate: decision.simulation?.metrics_before.est_cancel_rate ?? null,
        },
        metrics_after_relocation: {
          unmet_demand: unmetAfterRelocation,
          fulfillment_rate: fulfillmentRate(unmetAfterRelocation),
          avg_wait_proxy: decision.simulation?.metrics_after_relocation.avg_wait_proxy ?? null,
          est_cancel_rate: decision.simulation?.metrics_after_relocation.est_cancel_rate ?? null,
        },
        metrics_after: {
          unmet_demand: unmetAfterRelocation,
          fulfillment_rate: fulfillmentRate(unmetAfterRelocation),
          avg_wait_proxy: decision.simulation?.metrics_after_relocation.avg_wait_proxy ?? null,
          est_cancel_rate: decision.simulation?.metrics_after_relocation.est_cancel_rate ?? null,
        },
        metrics_after_activation_expected: { unmet_demand: unmetAfterActivation, fulfillment_rate: fulfillmentRate(unmetAfterActivation) },
        forecast_mode: decision.forecast_mode,
        forecast_run_id: forecastRunId ?? null,
        model_input_id: modelInputId ?? null,
        data_source: decision.data_source,
        activation_policy: decision.activation_policy,
        activation_recommendation: activation,
        simulation_basis: decision.simulation?.basis ?? null,
        plan_mode: planMode,
        planning_basis: isRiskAdvisory ? 'RISK_P90_ADVISORY' : 'POLICY_HOTSPOT',
        requested_offer_count: requestedOfferCount,
        expected_accepted_driver_count: targetDriverCount,
        eligible_offer_capacity: eligibleOfferCapacity,
        eligible_driver_count: eligibleOfferCapacity,
      },
      explanation: `${isRiskAdvisory ? 'Khuyến nghị sớm từ risk p90' : 'Phương án từ hotspot chính sách'}; dự báo ${decision.forecast.model_version} từ ${decision.data_source} của snapshot ${snapshot.id}; ${decision.plan.moves.length} lệnh điều chuyển.`,
      window_start_at: proposalWindow.startsAt,
      window_end_at: proposalWindow.endsAt,
    }).select('id').single();
    if (proposalError) this.db.unwrap(null, proposalError);
    if (!proposal) throw new UnprocessableEntityException('AI proposal could not be persisted');
    if (modelInputId) {
      const { error: outputError } = await this.db.client.from('model_outputs').insert({
        model_input_id: modelInputId,
        model_version: decision.forecast.model_version,
        horizon_min: decision.forecast.horizon_min,
        forecast_time: decision.forecast.forecast_ts,
        regime: decision.forecast.regime,
        output_payload: decision,
        processing_status: 'PROPOSAL_CREATED',
        proposal_id: proposal.id,
        processed_at: new Date().toISOString(),
      });
      if (outputError) this.db.unwrap(null, outputError);
    }
    return proposal;
  }

  private async eligibleDriverCount() {
    const { data, error } = await this.db.client
      .from('driver_states')
      .select('driver_id,profiles!driver_states_driver_id_fkey!inner(role,is_active)')
      .eq('is_online', true)
      .eq('operational_status', 'IDLE')
      .is('active_campaign_id', null)
      .eq('profiles.role', 'DRIVER')
      .eq('profiles.is_active', true);
    const rows = this.db.unwrap(data, error);
    return new Set(rows.map((row: DbRow) => String(row.driver_id))).size;
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.aiServiceUrl}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(`AI service returned ${response.status}`);
      return payload as T;
    } catch (cause) {
      throw new BadGatewayException({ code: 'AI_SERVICE_UNAVAILABLE', message: 'AI inference service is unavailable.' }, { cause });
    }
  }
}
