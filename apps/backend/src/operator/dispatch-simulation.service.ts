import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { SupabaseService } from '../supabase/supabase.service';

type SimulatedEvent = 'SENT' | 'ACKNOWLEDGED' | 'EN_ROUTE' | 'ARRIVED' | 'AVAILABLE';
type DispatchBatchRow = { id: string; released_at: string; released_by: string | null };
type DispatchMoveRow = {
  id: string;
  batch_id: string;
  state: string;
  planned_units: number;
  eta_minutes: number | string | null;
};

const arrivalLeadMinutes = 3;
const minimumSimulationDurationMs = 60_000;
const profileCount = 4;
const eventProgress: Readonly<Record<SimulatedEvent, { base: number; spread: number }>> = {
  SENT: { base: 0.04, spread: 0.015 },
  ACKNOWLEDGED: { base: 0.16, spread: 0.02 },
  EN_ROUTE: { base: 0.30, spread: 0.025 },
  ARRIVED: { base: 0.92, spread: 0.015 },
  AVAILABLE: { base: 1, spread: 0 },
};
const simulatedDriverNames = ['Minh Anh', 'Quang Huy', 'Thu Hà', 'Đức Long', 'Ngọc Mai', 'Hải Nam', 'Lan Chi', 'Tuấn Kiệt'];

const nextEventByState: Readonly<Record<string, SimulatedEvent>> = {
  PLANNED: 'SENT',
  RETRY_REQUESTED: 'SENT',
  SENT: 'ACKNOWLEDGED',
  ACKNOWLEDGED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'AVAILABLE',
};

export const nextSimulatedDispatchEvent = (state: string): SimulatedEvent | undefined => nextEventByState[state];

const stableSeed = (value: string) => Array.from(value).reduce(
  (seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0,
  2166136261,
);

const simulationProfile = (moveId: string) => stableSeed(moveId) % profileCount;

export const dispatchSimulationDurationMs = (etaMinutes: number) => Math.max(
  minimumSimulationDurationMs,
  (Math.max(0, etaMinutes) - arrivalLeadMinutes) * 60_000,
);

export const simulatedDispatchEventDueAt = (
  releasedAt: string,
  moveId: string,
  etaMinutes: number,
  eventType: SimulatedEvent,
) => {
  const releasedAtMs = Date.parse(releasedAt);
  if (!Number.isFinite(releasedAtMs)) return Number.POSITIVE_INFINITY;
  const profile = simulationProfile(moveId);
  const schedule = eventProgress[eventType];
  const progress = Math.min(1, schedule.base + schedule.spread * profile);
  return releasedAtMs + dispatchSimulationDurationMs(etaMinutes) * progress;
};

const simulatedDrivers = (moveId: string, count: number) => {
  const seed = stableSeed(moveId);
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const profileIndex = (seed + index * 3) % simulatedDriverNames.length;
    const plateSuffix = String(10_000 + ((seed + index * 7919) % 90_000)).padStart(5, '0');
    return {
      battery_soc: 52 + ((seed + index * 17) % 43),
      driver_id: `SIM-DRV-${String((seed + index) % 10_000).padStart(4, '0')}`,
      name: simulatedDriverNames[profileIndex],
      vehicle_plate: `30E-${plateSuffix.slice(0, 3)}.${plateSuffix.slice(3)}`,
    };
  });
};

@Injectable()
export class DispatchSimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchSimulationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly db: SupabaseService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get<string>('OPERATOR_DISPATCH_SIMULATION_ENABLED', 'false').toLowerCase() !== 'true') return;
    const configured = Number(this.config.get<string>('OPERATOR_DISPATCH_SIMULATION_INTERVAL_MS', '2000'));
    const intervalMs = Number.isFinite(configured) ? Math.max(configured, 1_000) : 2_000;
    this.logger.warn(`Local dispatch telemetry simulation is enabled (${intervalMs} ms/event).`);
    this.timer = setInterval(() => void this.advance(), intervalMs);
    this.timer.unref();
    void this.advance();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async advance(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const { data: batches, error: batchError } = await this.db.client
        .from('dispatch_batches')
        .select('id,released_at,released_by')
        .in('status', ['QUEUED', 'DISPATCHING', 'PARTIALLY_ACKED', 'IN_PROGRESS'])
        .order('released_at', { ascending: true });
      const activeBatches = this.db.unwrap(batches, batchError) as DispatchBatchRow[];
      for (const batch of activeBatches) {
        if (!batch.released_by) {
          this.logger.error(JSON.stringify({
            event: 'dispatch_simulation_skipped',
            batchId: batch.id,
            reason: 'MISSING_RELEASE_ACTOR',
          }));
          continue;
        }
        const { data: moves, error: moveError } = await this.db.client
          .from('dispatch_moves')
          .select('id,batch_id,state,planned_units,eta_minutes')
          .eq('batch_id', batch.id)
          .order('created_at', { ascending: true });
        const now = Date.now();
        const pendingEvent = (this.db.unwrap(moves, moveError) as DispatchMoveRow[])
          .flatMap((move) => {
            const eventType = nextSimulatedDispatchEvent(move.state);
            if (!eventType) return [];
            const etaMinutes = Number(move.eta_minutes ?? 0);
            const dueAt = simulatedDispatchEventDueAt(batch.released_at, move.id, etaMinutes, eventType);
            return dueAt <= now ? [{ dueAt, eventType, move }] : [];
          })
          .sort((left, right) => left.dueAt - right.dueAt || left.move.id.localeCompare(right.move.id))[0];
        if (!pendingEvent) continue;
        const { dueAt, eventType, move: pendingMove } = pendingEvent;
        const requestId = `dispatch-sim-${randomUUID()}`;
        const etaMinutes = Number(pendingMove.eta_minutes ?? 0);
        const profile = simulationProfile(pendingMove.id);
        const payload = {
          simulated: true,
          simulation_profile: profile,
          scheduled_at: new Date(dueAt).toISOString(),
          target_available_at: new Date(simulatedDispatchEventDueAt(
            batch.released_at,
            pendingMove.id,
            etaMinutes,
            'AVAILABLE',
          )).toISOString(),
          simulated_drivers: simulatedDrivers(pendingMove.id, Number(pendingMove.planned_units)),
          ...(eventType === 'ARRIVED' || eventType === 'AVAILABLE'
            ? { accuracy_m: 10, inside_target: true }
            : {}),
        };
        const { error } = await this.db.client.rpc('record_dispatch_event', {
          p_batch_id: pendingMove.batch_id,
          p_move_id: pendingMove.id,
          p_event_key: `local-sim:${pendingMove.batch_id}:${pendingMove.id}:${eventType}`,
          p_event_type: eventType,
          p_units: Number(pendingMove.planned_units),
          p_occurred_at: new Date().toISOString(),
          p_source: 'local-dispatch-simulator',
          p_payload: payload,
          p_request_id: requestId,
          p_actor_id: batch.released_by,
        });
        if (error) this.db.unwrap(null, error);
        this.logger.log(JSON.stringify({
          event: 'dispatch_simulation_advanced',
          batchId: pendingMove.batch_id,
          moveId: pendingMove.id,
          eventType,
          scheduledAt: payload.scheduled_at,
          targetAvailableAt: payload.target_available_at,
        }));
        return true;
      }
      return false;
    } catch (cause) {
      this.logger.error(JSON.stringify({
        event: 'dispatch_simulation_failed',
        message: cause instanceof Error ? cause.message : String(cause),
      }));
      return false;
    } finally {
      this.running = false;
    }
  }
}
