import { releaseTerminalDriverState } from './driver-state-reconciliation';

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    select: jest.fn(),
    update: jest.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

describe('driver state reconciliation', () => {
  it('releases a driver whose active campaign is terminal', async () => {
    const state = query({
      data: { driver_id: 'driver-1', active_campaign_id: 'campaign-1', is_online: true },
      error: null,
    });
    const campaign = query({ data: { status: 'COMPLETED' }, error: null });
    const release = query({ data: null, error: null });
    release.eq.mockImplementationOnce(() => release).mockResolvedValueOnce({ data: null, error: null });
    const db = {
      client: {
        from: jest.fn()
          .mockReturnValueOnce(state)
          .mockReturnValueOnce(campaign)
          .mockReturnValueOnce(release),
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };

    await expect(releaseTerminalDriverState(db as never, 'driver-1')).resolves.toBe(true);
    expect(release.update).toHaveBeenCalledWith(expect.objectContaining({
      active_campaign_id: null,
      operational_status: 'IDLE',
    }));
  });

  it('preserves an active campaign assignment', async () => {
    const state = query({
      data: { driver_id: 'driver-1', active_campaign_id: 'campaign-1', is_online: true },
      error: null,
    });
    const campaign = query({ data: { status: 'ACTIVE' }, error: null });
    const db = {
      client: { from: jest.fn().mockReturnValueOnce(state).mockReturnValueOnce(campaign) },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };

    await expect(releaseTerminalDriverState(db as never, 'driver-1')).resolves.toBe(false);
  });
});
