import { ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

describe('HealthService', () => {
  const query = (error: unknown = null) => ({
    from: jest.fn(() => ({ select: jest.fn().mockResolvedValue({ error }) })),
  });

  it('reports ready only after a real database query', async () => {
    const service = new HealthService({ client: query() } as any);
    await expect(service.readiness()).resolves.toMatchObject({ status: 'ready', checks: { database: { status: 'up' } } });
  });

  it('returns not ready when the database is unavailable', async () => {
    const service = new HealthService({ client: query(new Error('down')) } as any);
    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
