import { ConfigService } from '@nestjs/config';

import { CampaignLifecycleService } from './campaign-lifecycle.service';

describe('CampaignLifecycleService', () => {
  it('runs the idempotent database reconciliation', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { campaigns_transitioned: 1, offers_expired: 2, request_id: 'lifecycle-1', ran_at: '2026-08-09T00:00:00Z' },
      error: null,
    });
    const db = { client: { rpc }, unwrap: (data: unknown) => data } as any;
    const service = new CampaignLifecycleService(db, new ConfigService({ CAMPAIGN_LIFECYCLE_ENABLED: 'false' }));

    await expect(service.reconcile()).resolves.toMatchObject({ campaigns_transitioned: 1, offers_expired: 2 });
    expect(rpc).toHaveBeenCalledWith('reconcile_campaign_lifecycle', expect.objectContaining({ p_request_id: expect.stringMatching(/^lifecycle-/) }));
  });

  it('does not overlap two reconciliation runs', async () => {
    let resolveRpc!: (value: unknown) => void;
    const rpc = jest.fn(() => new Promise((resolve) => { resolveRpc = resolve; }));
    const db = { client: { rpc }, unwrap: (data: unknown) => data } as any;
    const service = new CampaignLifecycleService(db, new ConfigService({ CAMPAIGN_LIFECYCLE_ENABLED: 'false' }));

    const first = service.reconcile();
    await expect(service.reconcile()).resolves.toBeNull();
    resolveRpc({ data: { campaigns_transitioned: 0, offers_expired: 0 }, error: null });
    await first;
  });
});
