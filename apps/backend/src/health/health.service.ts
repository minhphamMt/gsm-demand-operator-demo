import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class HealthService {
  constructor(private readonly db: SupabaseService) {}

  liveness() {
    return { status: 'ok', service: 'gsm-backend', timestamp: new Date().toISOString() };
  }

  async readiness() {
    const startedAt = Date.now();
    const { error } = await this.db.client
      .from('supply_demand_snapshots')
      .select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - startedAt;
    if (error) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'Database readiness check failed',
        details: { checks: { database: { status: 'down', latencyMs } } },
      });
    }
    return {
      status: 'ready',
      service: 'gsm-backend',
      timestamp: new Date().toISOString(),
      checks: { database: { status: 'up', latencyMs } },
    };
  }

  metrics() {
    const memory = process.memoryUsage();
    return {
      service: 'gsm-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
    };
  }
}
