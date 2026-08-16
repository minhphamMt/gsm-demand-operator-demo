import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports service status', () => {
    const health = { liveness: () => ({ status: 'ok', service: 'gsm-backend' }) } as any;
    expect(new HealthController(health).check()).toMatchObject({ status: 'ok', service: 'gsm-backend' });
  });
});
