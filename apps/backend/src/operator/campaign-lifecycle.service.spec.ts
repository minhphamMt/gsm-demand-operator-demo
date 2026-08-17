import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import { CampaignLifecycleService } from './campaign-lifecycle.service';

describe('CampaignLifecycleService', () => {
  const dbWith = (rpc: jest.Mock) => {
    const stateQuery = {
      not: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn(),
    };
    stateQuery.select.mockReturnValue(stateQuery);
    return {
      client: { from: jest.fn().mockReturnValue(stateQuery), rpc },
      unwrap: (data: unknown, error?: unknown) => {
        if (error) throw error;
        return data;
      },
    } as any;
  };

  it('runs the idempotent database reconciliation', async () => {
    const rpc = jest.fn((name: string) => Promise.resolve(name === 'expire_stale_approved_proposals'
      ? { data: { proposals_staled: 1 }, error: null }
      : { data: { campaigns_transitioned: 1, offers_expired: 2, request_id: 'lifecycle-1', ran_at: '2026-08-09T00:00:00Z' }, error: null }));
    const db = dbWith(rpc);
    const service = new CampaignLifecycleService(db, new ConfigService({ CAMPAIGN_LIFECYCLE_ENABLED: 'false' }));

    await expect(service.reconcile()).resolves.toMatchObject({ campaigns_transitioned: 1, offers_expired: 2, proposals_staled: 1 });
    expect(rpc).toHaveBeenCalledWith('expire_stale_approved_proposals', expect.objectContaining({ p_request_id: expect.stringMatching(/^lifecycle-/) }));
    expect(rpc).toHaveBeenCalledWith('reconcile_campaign_lifecycle', expect.objectContaining({ p_request_id: expect.stringMatching(/^lifecycle-/) }));
  });

  it('does not overlap two reconciliation runs', async () => {
    let resolveRpc!: (value: unknown) => void;
    const rpc = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRpc = resolve; }))
      .mockResolvedValueOnce({ data: { campaigns_transitioned: 0, offers_expired: 0, request_id: 'lifecycle-1', ran_at: '2026-08-09T00:00:00Z' }, error: null });
    const db = dbWith(rpc);
    const service = new CampaignLifecycleService(db, new ConfigService({ CAMPAIGN_LIFECYCLE_ENABLED: 'false' }));

    const first = service.reconcile();
    await expect(service.reconcile()).resolves.toBeNull();
    resolveRpc({ data: { proposals_staled: 0 }, error: null });
    await first;
  });

  it('records the actual reconciliation failure instead of hiding it', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rpc = jest.fn().mockRejectedValue(new Error('lifecycle RPC unavailable'));
    const service = new CampaignLifecycleService(
      dbWith(rpc),
      new ConfigService({ CAMPAIGN_LIFECYCLE_ENABLED: 'false' }),
    );

    await expect(service.reconcile()).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('lifecycle RPC unavailable'));
    log.mockRestore();
  });
});
