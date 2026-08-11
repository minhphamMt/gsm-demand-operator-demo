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
  forecast: { forecast_ts: string; horizon_min: number; model_version: string; regime: string; zones: AiForecastZone[] };
  hotspots: { hotspots: Array<{ zone_id: number; gap: number }> };
  plan: { moves: Array<Record<string, unknown>>; residual_gap: Array<{ zone_id: number; gap_remaining: number; suggested_activation: number }>; plan_totals: { total_cost: number; budget_cap: number }; warnings: Array<Record<string, unknown>> };
};

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

  async generate(horizonMinutes: 15 | 30) {
    const { data: snapshot, error: snapshotError } = await this.db.client
      .from('supply_demand_snapshots')
      .select('*')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshotError) this.db.unwrap(null, snapshotError);
    if (!snapshot) throw new UnprocessableEntityException('No live snapshot is available for AI inference');

    const { data: observations, error: observationsError } = await this.db.client
      .from('ai_zone_observations')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .order('zone_id');
    const zones = this.validateLiveZones(this.db.unwrap(observations, observationsError));
    const capturedAt = new Date(String(snapshot.captured_at));
    if (capturedAt.getUTCMinutes() % 5 || capturedAt.getUTCSeconds() || capturedAt.getUTCMilliseconds()) {
      throw new UnprocessableEntityException({ code: 'AI_SNAPSHOT_OFF_GRID', message: 'Snapshot timestamp must align to a 5-minute bucket.' });
    }

    const decision = await this.request<AiDecision>('/api/v1/decisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        snapshot_id: snapshot.id,
        t: capturedAt.toISOString(),
        horizon_min: horizonMinutes,
        data_source: `supabase:ai_zone_observations:${snapshot.id}`,
        zones,
      }),
    });
    await this.persistDecision(snapshot, decision);
    return decision;
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

  private async persistDecision(snapshot: DbRow, decision: AiDecision) {
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
    this.db.unwrap(null, forecastError);

    const targetZoneIds = [...new Set([
      ...decision.hotspots.hotspots.map((hotspot) => hotspot.zone_id),
      ...decision.plan.residual_gap.map((gap) => gap.zone_id),
    ])].sort((left, right) => left - right);
    const unmetBefore = decision.hotspots.hotspots.reduce((sum, hotspot) => sum + Math.max(0, hotspot.gap), 0);
    const unmetAfter = decision.plan.residual_gap.reduce((sum, gap) => sum + gap.gap_remaining, 0);
    const targetDriverCount = decision.plan.residual_gap.reduce((sum, gap) => sum + gap.suggested_activation, 0);
    const { data: proposal, error: proposalError } = await this.db.client.from('proposals').insert({
      generator_type: 'AGENT',
      generator_version: decision.forecast.model_version,
      status: 'UNDER_REVIEW',
      policy_status: 'PASSED',
      version: 1,
      input_snapshot_id: snapshot.id,
      target_zone_ids: targetZoneIds,
      source_plan: decision.plan,
      target_driver_count: targetDriverCount,
      offer_count: 0,
      estimated_cost: decision.plan.plan_totals.total_cost,
      simulation_details: {
        title: `AI điều phối ${decision.forecast.horizon_min} phút`,
        scenario_id: decision.forecast.regime === 'rain_peak' ? 'rain-peak' : 'normal',
        warnings: decision.plan.warnings,
        metrics_before: { unmet_demand: unmetBefore },
        metrics_after: { unmet_demand: unmetAfter },
        forecast_mode: decision.forecast_mode,
        data_source: decision.data_source,
      },
      explanation: `Dự báo ${decision.forecast.model_version} từ 30 zone live của snapshot ${snapshot.id}; ${decision.plan.moves.length} lệnh điều chuyển.`,
      window_start_at: snapshot.captured_at,
      window_end_at: decision.forecast.forecast_ts,
    }).select('id').single();
    if (proposalError) this.db.unwrap(null, proposalError);
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
