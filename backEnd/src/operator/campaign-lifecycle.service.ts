import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { releaseAllTerminalDriverStates } from '../common/driver-state-reconciliation';
import { SupabaseService } from '../supabase/supabase.service';

export interface LifecycleResult {
  campaigns_transitioned: number;
  offers_expired: number;
  request_id: string;
  ran_at: string;
}

@Injectable()
export class CampaignLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignLifecycleService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly db: SupabaseService, private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get<string>('CAMPAIGN_LIFECYCLE_ENABLED', 'true') === 'false') return;
    const configured = Number(this.config.get<string>('CAMPAIGN_LIFECYCLE_INTERVAL_MS', '30000'));
    const intervalMs = Number.isFinite(configured) ? Math.max(configured, 5_000) : 30_000;
    this.timer = setInterval(() => void this.reconcile(), intervalMs);
    this.timer.unref();
    void this.reconcile();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<LifecycleResult | null> {
    if (this.running) return null;
    this.running = true;
    const requestId = `lifecycle-${randomUUID()}`;
    try {
      const { data, error } = await this.db.client.rpc('reconcile_campaign_lifecycle', { p_request_id: requestId });
      const result = this.db.unwrap(data as LifecycleResult | null, error);
      const driversReleased = await releaseAllTerminalDriverStates(this.db);
      if (result.campaigns_transitioned || result.offers_expired) {
        this.logger.log(JSON.stringify({ event: 'campaign_lifecycle_reconciled', ...result, drivers_released: driversReleased }));
      }
      return result;
    } catch {
      this.logger.error(JSON.stringify({ event: 'campaign_lifecycle_failed', requestId, error: 'reconciliation_failed' }));
      return null;
    } finally {
      this.running = false;
    }
  }
}
