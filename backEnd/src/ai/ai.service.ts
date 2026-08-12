import { BadGatewayException, Injectable, UnprocessableEntityException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';

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
  hotspots: { hotspots: Array<{ zone_id: number; gap: number }> };
  plan: { moves: Array<Record<string, unknown> & { to_zone?: number; units_to_move?: number; drivers?: number }>; residual_gap: Array<{ zone_id: number; gap_remaining: number; suggested_activation: number }>; plan_totals: { total_cost: number; budget_cap: number }; warnings: Array<Record<string, unknown>> };
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

  async runNext(horizonMinutes: 15 | 30, regime?: DatasetRegime) {
    const snapshot = await this.ingestNext(regime);
    const decision = await this.generate(horizonMinutes, snapshot.id, false, true);
    return { snapshot, decision };
  }

  async optimize(snapshotId: number, horizonMinutes: 5 | 15 | 30) {
    const decision = await this.generate(horizonMinutes, snapshotId, true, true);
    return { decision };
  }

  async forecast(snapshotId: number, horizonMinutes: 5 | 15 | 30) {
    const decision = await this.generate(horizonMinutes, snapshotId, false, true);
    return { decision };
  }

  async runReplay(sourceAt: string) {
    const dataset = await this.request<DatasetSnapshot>('/api/v1/datasets/snapshots/at', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_at: sourceAt }),
    });
    const snapshot = await this.ingestExact(dataset);
    const decision = await this.generate(5, snapshot.id, false);
    if (decision.forecast_mode !== 'trained_model_replay') {
      throw new UnprocessableEntityException({ code: 'REPLAY_MODEL_REQUIRED', message: 'Replay requires the trained LightGBM model; fallback output was rejected.' });
    }
    return { snapshot, decision };
  }

  async replayWindow(sourceAt: string) {
    return this.request<{ steps: Array<{ source_at: string; mean_rain_mm_h: number }> }>('/api/v1/datasets/snapshots/window', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_at: sourceAt }),
    });
  }

  async generate(horizonMinutes: 5 | 15 | 30, snapshotId?: number, persistProposal = true, persistForecast = persistProposal) {
    let snapshotQuery = this.db.client.from('supply_demand_snapshots').select('*');
    snapshotQuery = snapshotId
      ? snapshotQuery.eq('id', snapshotId)
      : snapshotQuery.order('captured_at', { ascending: false }).order('id', { ascending: false }).limit(1);
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

    try {
      const decision = await this.request<AiDecision>('/api/v1/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inputPayload),
      });
      if (persistForecast && persistProposal) {
        await this.persistDecision(snapshot, decision, String(modelInput.id));
      } else {
        if (persistForecast) await this.persistForecast(snapshot, decision);
        if (persistProposal) await this.persistProposal(snapshot, decision, String(modelInput.id));
      }
      const { error: completeError } = await this.db.client.from('model_inputs').update({
        status: 'COMPLETED',
        error_message: null,
      }).eq('id', modelInput.id);
      if (completeError) this.db.unwrap(null, completeError);
      return decision;
    } catch (cause) {
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
      .from('ai_zone_observations')
      .select('source_name,snapshot_id')
      .like('source_name', 'AI_PARQUET_REPLAY:%')
      .order('snapshot_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (replayError) this.db.unwrap(null, replayError);
    const afterSourceAt = latestReplay?.source_name
      ? String(latestReplay.source_name).slice('AI_PARQUET_REPLAY:'.length)
      : undefined;
    const dataset = await this.request<DatasetSnapshot>('/api/v1/datasets/snapshots/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ after_source_at: afterSourceAt, regime }),
    });
    if (dataset.zones.length !== 30 || new Set(dataset.zones.map((zone) => zone.zone_id)).size !== 30) {
      throw new UnprocessableEntityException('Dataset snapshot must contain exactly 30 unique zones');
    }
    const capturedAt = new Date();
    capturedAt.setUTCSeconds(0, 0);
    capturedAt.setUTCMinutes(capturedAt.getUTCMinutes() - (capturedAt.getUTCMinutes() % 5));
    const totalDemand = dataset.zones.reduce((sum, zone) => sum + zone.demand_observed, 0);
    const totalSupply = dataset.zones.reduce((sum, zone) => sum + zone.idle_supply + zone.enroute_supply, 0);
    const { data: snapshot, error: snapshotError } = await this.db.client.from('supply_demand_snapshots').insert({
      captured_at: capturedAt.toISOString(),
      data_source: 'AI_PARQUET_DATASET',
      scenario_code: dataset.regime.toUpperCase(),
      total_demand: totalDemand,
      total_supply: totalSupply,
    }).select('id,captured_at,data_source,scenario_code,total_demand,total_supply').single();
    if (snapshotError) this.db.unwrap(null, snapshotError);
    if (!snapshot) throw new UnprocessableEntityException('Dataset snapshot could not be persisted');
    const sourceName = `AI_PARQUET_REPLAY:${dataset.source_at}`;
    const { error: observationsError } = await this.db.client.from('ai_zone_observations').insert(
      dataset.zones.map((zone) => ({
        ...zone,
        snapshot_id: snapshot.id,
        data_status: 'live',
        source_name: sourceName,
        source_updated_at: capturedAt.toISOString(),
      })),
    );
    if (observationsError) {
      await this.db.client.from('supply_demand_snapshots').delete().eq('id', snapshot.id);
      this.db.unwrap(null, observationsError);
    }
    return { ...snapshot, dataset: dataset.dataset, sourceAt: dataset.source_at, regime: dataset.regime };
  }

  private async ingestExact(dataset: DatasetSnapshot) {
    const sourceName = `AI_PARQUET_REPLAY:${dataset.source_at}`;
    const { data: existingObservation, error: existingError } = await this.db.client
      .from('ai_zone_observations').select('snapshot_id,source_updated_at').eq('source_name', sourceName)
      .order('snapshot_id', { ascending: false }).limit(1).maybeSingle();
    if (existingError) this.db.unwrap(null, existingError);
    const existingIsFresh = existingObservation?.source_updated_at
      && Date.now() - new Date(String(existingObservation.source_updated_at)).getTime() < 30 * 60_000;
    if (existingObservation?.snapshot_id && existingIsFresh) {
      const { data: existing, error } = await this.db.client.from('supply_demand_snapshots').select('*').eq('id', existingObservation.snapshot_id).single();
      return this.db.unwrap(existing, error);
    }
    const totalDemand = dataset.zones.reduce((sum, zone) => sum + zone.demand_observed, 0);
    const totalSupply = dataset.zones.reduce((sum, zone) => sum + zone.idle_supply + zone.enroute_supply, 0);
    const capturedAt = new Date();
    capturedAt.setUTCSeconds(0, 0);
    capturedAt.setUTCMinutes(capturedAt.getUTCMinutes() - (capturedAt.getUTCMinutes() % 5));
    const { data: snapshot, error: snapshotError } = await this.db.client.from('supply_demand_snapshots').insert({
      captured_at: capturedAt.toISOString(), data_source: 'AI_PARQUET_DATASET', scenario_code: dataset.regime.toUpperCase(),
      total_demand: totalDemand, total_supply: totalSupply,
    }).select('*').single();
    if (snapshotError) this.db.unwrap(null, snapshotError);
    const { error: observationsError } = await this.db.client.from('ai_zone_observations').insert(dataset.zones.map((zone) => ({
      ...zone, snapshot_id: snapshot.id, data_status: 'live', source_name: sourceName, source_updated_at: capturedAt.toISOString(),
    })));
    if (observationsError) {
      await this.db.client.from('supply_demand_snapshots').delete().eq('id', snapshot.id);
      this.db.unwrap(null, observationsError);
    }
    return snapshot;
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

  private async persistForecast(snapshot: DbRow, decision: AiDecision) {
    const forecastRows = decision.forecast.zones.map((zone) => ({
      ...zone,
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
      .upsert(forecastRows, { onConflict: 'snapshot_id,zone_id,horizon_min' });
    if (forecastError) this.db.unwrap(null, forecastError);
  }

  private async persistDecision(snapshot: DbRow, decision: AiDecision, modelInputId?: string) {
    await this.persistForecast(snapshot, decision);
    await this.persistProposal(snapshot, decision, modelInputId);
  }

  private async persistProposal(snapshot: DbRow, decision: AiDecision, modelInputId?: string) {
    const activation = decision.activation_recommendation;
    const targetZoneIds = activation.target_zones.map((target) => target.zone_id);
    const unmetBefore = decision.hotspots.hotspots.reduce((sum, hotspot) => sum + Math.max(0, hotspot.gap), 0);
    const unmetAfterRelocation = decision.plan.residual_gap.reduce((sum, gap) => sum + gap.gap_remaining, 0);
    const predictedDemand = decision.forecast.zones.reduce((sum, zone) => sum + zone.predicted_demand, 0);
    const predictedSupply = decision.forecast.zones.reduce((sum, zone) => sum + zone.predicted_supply, 0);
    const fulfillmentRate = (unmet: number) => predictedDemand > 0
      ? Math.max(0, (1 - unmet / predictedDemand) * 100)
      : 100;
    const requestedOfferCount = activation.total_requested_offers;
    const incentiveAmount = Number(decision.activation_policy.incentive_amount);
    const eligibleOfferCapacity = predictedSupply > 0 ? Math.floor(predictedSupply) : requestedOfferCount;
    const offerCount = Math.min(requestedOfferCount, eligibleOfferCapacity);
    const availableOfferRatio = requestedOfferCount > 0 ? offerCount / requestedOfferCount : 0;
    const effectiveActivationGain = Math.min(
      unmetAfterRelocation,
      activation.total_expected_units_gained * availableOfferRatio,
    );
    const targetDriverCount = Math.min(offerCount, Math.ceil(effectiveActivationGain));
    const unmetAfterActivation = Math.max(0, unmetAfterRelocation - effectiveActivationGain);
    const hasDirectRelocation = decision.plan.moves.length > 0;
    const relocationImproves = hasDirectRelocation;
    const activationImproves = !hasDirectRelocation
      && targetDriverCount > 0
      && incentiveAmount > 0
      && activation.total_expected_units_gained > 0
      && unmetAfterActivation < unmetBefore;
    const isOperationalPlan = relocationImproves || activationImproves;
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
    const { data: proposal, error: proposalError } = await this.db.client.from('proposals').insert({
      generator_type: 'AGENT',
      generator_version: decision.forecast.model_version,
      status: 'UNDER_REVIEW',
      policy_status: isOperationalPlan ? 'PASSED' : 'FAILED',
      version: 1,
      input_snapshot_id: snapshot.id,
      target_zone_ids: targetZoneIds,
      source_plan: { ...decision.plan, activation_recommendation: activation },
      target_driver_count: targetDriverCount,
      offer_count: offerCount,
      bonus_amount: incentiveAmount,
      fare_multiplier: 1,
      estimated_cost: estimatedIncentiveCost,
      simulation_details: {
        title: `AI điều phối ${decision.forecast.horizon_min} phút`,
        scenario_id: decision.forecast.regime.replace('_', '-'),
        warnings: proposalWarnings,
        metrics_before: { unmet_demand: unmetBefore, fulfillment_rate: fulfillmentRate(unmetBefore) },
        metrics_after_relocation: { unmet_demand: unmetAfterRelocation, fulfillment_rate: fulfillmentRate(unmetAfterRelocation) },
        metrics_after: { unmet_demand: unmetAfterRelocation, fulfillment_rate: fulfillmentRate(unmetAfterRelocation) },
        metrics_after_activation_expected: { unmet_demand: unmetAfterActivation, fulfillment_rate: fulfillmentRate(unmetAfterActivation) },
        forecast_mode: decision.forecast_mode,
        data_source: decision.data_source,
        activation_policy: decision.activation_policy,
        activation_recommendation: activation,
        plan_mode: hasDirectRelocation ? 'RELOCATION' : 'ACTIVATION_ONLY',
        requested_offer_count: requestedOfferCount,
        expected_accepted_driver_count: targetDriverCount,
        eligible_offer_capacity: eligibleOfferCapacity,
      },
      explanation: `Dự báo ${decision.forecast.model_version} từ 30 zone live của snapshot ${snapshot.id}; ${decision.plan.moves.length} lệnh điều chuyển.`,
      window_start_at: snapshot.captured_at,
      window_end_at: decision.forecast.forecast_ts,
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
