import { rateLimitTracker } from './actor-throttler.guard';

describe('rateLimitTracker', () => {
  it('uses the authenticated actor so operators behind one NAT do not share a bucket', () => {
    expect(rateLimitTracker({ user: { id: 'operator-42' }, ip: '10.0.0.1' } as any)).toBe('operator-42');
  });

  it('falls back to the request IP before authentication is available', () => {
    expect(rateLimitTracker({ ip: '10.0.0.2' } as any)).toBe('10.0.0.2');
  });
});
