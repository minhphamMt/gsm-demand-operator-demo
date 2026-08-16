import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { SupabaseService } from '../supabase/supabase.service';

type SimulatedEvent = 'SENT' | 'ACKNOWLEDGED' | 'EN_ROUTE' | 'ARRIVED' | 'AVAILABLE';
type DispatchBatchRow = { id: string; released_by: string | null };
type DispatchMoveRow = { id: string; batch_id: string; state: string; planned_units: number };

const nextEventByState: Readonly<Record<string, SimulatedEvent>> = {
  PLANNED: 'SENT',
  RETRY_REQUESTED: 'SENT',
  SENT: 'ACKNOWLEDGED',
  ACKNOWLEDGED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'AVAILABLE',
};

export const nextSimulatedDispatchEvent = (state: string): SimulatedEvent | undefined => nextEventByState[state];

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
        .select('id,released_by')
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
          .select('id,batch_id,state,planned_units')
          .eq('batch_id', batch.id)
          .order('created_at', { ascending: true });
        const pendingMove = (this.db.unwrap(moves, moveError) as DispatchMoveRow[])
          .find((move) => nextSimulatedDispatchEvent(move.state) !== undefined);
        if (!pendingMove) continue;
        const eventType = nextSimulatedDispatchEvent(pendingMove.state)!;
        const requestId = `dispatch-sim-${randomUUID()}`;
        const { error } = await this.db.client.rpc('record_dispatch_event', {
          p_batch_id: pendingMove.batch_id,
          p_move_id: pendingMove.id,
          p_event_key: `local-sim:${pendingMove.batch_id}:${pendingMove.id}:${eventType}`,
          p_event_type: eventType,
          p_units: Number(pendingMove.planned_units),
          p_occurred_at: new Date().toISOString(),
          p_source: 'local-dispatch-simulator',
          p_payload: eventType === 'ARRIVED' || eventType === 'AVAILABLE'
            ? { accuracy_m: 10, inside_target: true, simulated: true }
            : { simulated: true },
          p_request_id: requestId,
          p_actor_id: batch.released_by,
        });
        if (error) this.db.unwrap(null, error);
        this.logger.log(JSON.stringify({
          event: 'dispatch_simulation_advanced',
          batchId: pendingMove.batch_id,
          moveId: pendingMove.id,
          eventType,
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
