import { BadGatewayException, Injectable, UnprocessableEntityException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';

type LiveCell = Record<string, unknown>;
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

    const [{ data: cells, error: cellsError }, { data: h3Cells, error: h3Error }] = await Promise.all([
      this.db.client.from('supply_demand_cells').select('*').eq('snapshot_id', snapshot.id),
      this.db.client.from('h3_cells_api_v').select('h3_index,ai_zone_id,district_name'),
    ]);
    this.db.unwrap(cells, cellsError);
    this.db.unwrap(h3Cells, h3Error);
    const h3ById = new Map((h3Cells ?? []).map((cell: LiveCell) => [String(cell.h3_index), cell]));
    const grouped = this.groupLiveZones(cells ?? [], h3ById);
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
        data_source: `supabase:supply_demand_snapshots:${snapshot.id}`,
        zones: grouped,
      }),
    });
    await this.persistDecision(snapshot, decision, h3Cells ?? []);
    return decision;
  }

  private groupLiveZones(cells: LiveCell[], h3ById: Map<string, LiveCell>) {
    const groups = new Map<number, LiveCell[]>();
    const missingMapping: string[] = [];
    for (const cell of cells) {
      const h3Index = String(cell.h3_index ?? '');
      const zoneId = Number(h3ById.get(h3Index)?.ai_zone_id);
      if (!Number.isInteger(zoneId) || zoneId < 1 || zoneId > 30) {
        missingMapping.push(h3Index);
        continue;
      }
      groups.set(zoneId, [...(groups.get(zoneId) ?? []), cell]);
    }
    const missingZones = Array.from({ length: 30 }, (_, index) => index + 1).filter((zoneId) => !groups.has(zoneId));
    if (missingMapping.length || missingZones.length) {
      throw new UnprocessableEntityException({
        code: 'AI_ZONE_COVERAGE_INCOMPLETE',
        message: 'Live snapshot does not map to all 30 AI zones.',
        details: { missingH3Mappings: missingMapping, missingZones },
      });
    }
    return [...groups.entries()].map(([zoneId, rows]) => {
      const weather = rows[0];
      const requiredWeather = ['rain_mm_h', 'rain_forecast_15', 'rain_forecast_30', 'peak_flag', 'holiday_flag'];
      const missingWeather = requiredWeather.filter((field) => weather[field] === null || weather[field] === undefined);
      if (missingWeather.length) {
        throw new UnprocessableEntityException({
          code: 'AI_WEATHER_INPUT_MISSING',
          message: `Zone ${zoneId} is missing real weather inputs.`,
          details: { zoneId, fields: missingWeather },
        });
      }
      return {
        zone_id: zoneId,
        demand_observed: this.sum(rows, 'current_demand'),
        idle_supply: this.sum(rows, 'available_supply'),
        enroute_supply: this.sum(rows, 'enroute_supply'),
        rain_mm_h: Number(weather.rain_mm_h),
        rain_forecast_15: Number(weather.rain_forecast_15),
        rain_forecast_30: Number(weather.rain_forecast_30),
        peak_flag: Number(weather.peak_flag),
        holiday_flag: Number(weather.holiday_flag),
      };
    });
  }

  private async persistDecision(snapshot: LiveCell, decision: AiDecision, h3Cells: LiveCell[]) {
    const forecastRows = decision.forecast.zones.map((zone) => ({
      ...zone,
      snapshot_id: snapshot.id,
      horizon_min: decision.forecast.horizon_min,
      forecast_at: decision.forecast.forecast_ts,
      regime: decision.forecast.regime,
      model_version: decision.forecast.model_version,
    }));
    const { error: forecastError } = await this.db.client
      .from('ai_zone_forecasts')
      .upsert(forecastRows, { onConflict: 'snapshot_id,zone_id,horizon_min' });
    this.db.unwrap(null, forecastError);

    const targetZoneIds = new Set([
      ...decision.hotspots.hotspots.map((hotspot) => hotspot.zone_id),
      ...decision.plan.residual_gap.map((gap) => gap.zone_id),
    ]);
    const targetH3 = h3Cells
      .filter((cell) => targetZoneIds.has(Number(cell.ai_zone_id)))
      .map((cell) => String(cell.h3_index));
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
      target_h3_indexes: targetH3,
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
      explanation: `Dự báo ${decision.forecast.model_version} từ snapshot live ${snapshot.id}; ${decision.plan.moves.length} lệnh điều chuyển.`,
      window_start_at: snapshot.captured_at,
      window_end_at: decision.forecast.forecast_ts,
    }).select('id').single();
    if (proposalError) this.db.unwrap(null, proposalError);
    return proposal;
  }

  private sum(rows: LiveCell[], field: string) {
    return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
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
